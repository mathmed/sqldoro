import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { CRM, SHOP } from '../../../test/support/query.ts'
import { ScriptedEngine } from '../../../test/support/sessions.ts'
import type { Session, SessionRequest } from '../../core/session/open-session.ts'
import { CloseReason } from '../transactions/editor-transactions.ts'
import { EditorSessions, type SessionLifecycle } from './editor-sessions.ts'

const SALES = { database: 'shop', schema: 'sales' }

let engine: ScriptedEngine
let requests: SessionRequest[]
let close: Mock<() => Promise<void>>
let log: ReturnType<typeof recordingLogger>
let lifecycle: {
  [K in keyof SessionLifecycle]: Mock<SessionLifecycle[K]>
}

function sessions(open?: () => Promise<Session>): EditorSessions {
  return new EditorSessions({
    open:
      open ??
      (async (request) => {
        requests.push(request)
        return Promise.resolve({ engine: {} as never, engineSession: engine.session(), close })
      }),
    readSecrets: async () => Promise.resolve(new Map([['password', 's3cret']])),
    log,
    lifecycle,
  })
}

beforeEach(() => {
  engine = new ScriptedEngine()
  requests = []
  close = vi.fn<() => Promise<void>>(async () => Promise.resolve())
  log = recordingLogger()
  lifecycle = {
    beforeClose: vi.fn<SessionLifecycle['beforeClose']>(async () => Promise.resolve()),
    onLost: vi.fn<SessionLifecycle['onLost']>(),
    isPinned: vi.fn<SessionLifecycle['isPinned']>(() => false),
  }
})

describe('EditorSessions', () => {
  it('should open a connection of its own for an editor, in the database and schema it runs in', async () => {
    const sut = sessions()

    await sut.acquire('a', SHOP, SALES)

    expect(requests[0]).toMatchObject({
      connection: { id: 'shop', database: 'shop' },
      secrets: new Map([['password', 's3cret']]),
    })
    expect(engine.useScope).toHaveBeenCalledWith(SALES)
  })

  it('should open in the database of the connection when the editor names none', async () => {
    const sut = sessions()

    await sut.acquire('a', CRM, { database: '', schema: '' })

    expect(requests[0]?.connection.database).toBe('crm')
  })

  it('should keep the session of an editor and move it when the scope changes', async () => {
    const sut = sessions()

    const first = await sut.acquire('a', SHOP, SALES)
    const same = await sut.acquire('a', SHOP, SALES)
    await sut.acquire('a', SHOP, { database: 'shop', schema: 'public' })

    expect(same).toBe(first)
    expect(requests).toHaveLength(1)
    expect(engine.useScope.mock.calls).toStrictEqual([
      [SALES],
      [{ database: 'shop', schema: 'public' }],
    ])
  })

  it('should close the session of an editor that moves to another connection', async () => {
    const sut = sessions()
    await sut.acquire('a', SHOP, SALES)

    await sut.acquire('a', CRM, { database: 'crm', schema: 'crm' })

    expect(close).toHaveBeenCalledOnce()
    expect(lifecycle.beforeClose).toHaveBeenCalledWith(
      'a',
      expect.anything(),
      CloseReason.ConnectionChanged,
    )
    expect(requests).toHaveLength(2)
  })

  it('should open the session again when the connection changes whether it may write', async () => {
    const sut = sessions()
    const first = await sut.acquire('a', SHOP, SALES)

    const second = await sut.acquire('a', { ...SHOP, isReadOnly: true }, SALES)
    const third = await sut.acquire('a', { ...SHOP, isReadOnly: true, name: 'Renamed' }, SALES)

    expect(second).not.toBe(first)
    expect(third).toBe(second)
    expect(requests.map((request) => request.connection.isReadOnly)).toStrictEqual([false, true])
  })

  it('should not move a session that holds an open transaction', async () => {
    const sut = sessions()
    await sut.acquire('a', SHOP, SALES)
    lifecycle.isPinned.mockReturnValue(true)

    await expect(sut.acquire('a', SHOP, SALES)).resolves.toBeDefined()
    await expect(sut.acquire('a', SHOP, { database: 'shop', schema: 'public' })).rejects.toThrow(
      'Commit or roll back the open transaction of this editor before it changes database or schema.',
    )
    expect(lifecycle.isPinned).toHaveBeenCalledWith('a')
    expect(engine.useScope).toHaveBeenCalledOnce()
  })

  it('should hand the session the editor has, without opening one', async () => {
    const sut = sessions()
    expect(sut.existing('a')).toBeUndefined()

    const session = await sut.acquire('a', SHOP, SALES)

    await expect(sut.existing('a')).resolves.toBe(session)
  })

  it('should forget a session that fails to open, and close one whose scope fails', async () => {
    const failing = sessions(async () => Promise.reject(new Error('refused')))
    await expect(failing.acquire('a', SHOP, SALES)).rejects.toThrow('refused')
    await expect(failing.acquire('a', SHOP, SALES)).rejects.toThrow('refused')

    const sut = sessions()
    engine.useScope.mockRejectedValueOnce(new Error('schema "x" does not exist'))
    await expect(sut.acquire('b', SHOP, SALES)).rejects.toThrow('schema "x" does not exist')
    expect(close).toHaveBeenCalledOnce()
    await sut.acquire('b', SHOP, SALES)
    expect(requests).toHaveLength(2)
  })

  it('should keep a newer session when an older one fails to open', async () => {
    const { promise, reject } = Promise.withResolvers<never>()
    let calls = 0
    const sut = sessions(async () => {
      calls += 1
      return calls === 1
        ? promise
        : Promise.resolve({ engine: {} as never, engineSession: engine.session(), close })
    })

    const failing = sut.acquire('a', SHOP, SALES)
    await sut.acquire('a', CRM, SALES).catch(() => undefined)
    reject(new Error('late'))

    await expect(failing).rejects.toThrow('late')
    await sut.release('a', CloseReason.EditorClosed)
    expect(close).toHaveBeenCalled()
  })

  it('should close the sessions of an editor, of a connection, or all of them', async () => {
    const sut = sessions()
    await sut.acquire('a', SHOP, SALES)
    await sut.acquire('b', SHOP, SALES)
    await sut.acquire('c', CRM, SALES)

    await sut.release('a', CloseReason.EditorClosed)
    await sut.release('missing', CloseReason.EditorClosed)
    await sut.releaseConnection('shop')
    expect(close).toHaveBeenCalledTimes(2)

    sut.dispose()
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledTimes(3)
    })
    expect(lifecycle.beforeClose.mock.calls.map(([uri, , reason]) => [uri, reason])).toStrictEqual([
      ['a', CloseReason.EditorClosed],
      ['b', CloseReason.ConnectionClosed],
      ['c', CloseReason.Shutdown],
    ])
  })

  it('should forget a session the server ends, and log it', async () => {
    const sut = sessions()
    await sut.acquire('a', SHOP, SALES)

    requests[0]?.onUnexpectedClose(new Error('terminated'))
    await sut.acquire('a', SHOP, SALES)

    expect(log.warn).toHaveBeenCalledWith('The connection of a ended: terminated')
    expect(lifecycle.onLost).toHaveBeenCalledWith('a')
    expect(requests).toHaveLength(2)
  })

  it('should log a session that does not close cleanly', async () => {
    const sut = sessions()
    close.mockRejectedValueOnce(new Error('already gone'))
    await sut.acquire('a', SHOP, SALES)

    await sut.release('a', CloseReason.EditorClosed)

    expect(log.warn).toHaveBeenCalledWith('Could not close an editor connection: already gone')
  })
})
