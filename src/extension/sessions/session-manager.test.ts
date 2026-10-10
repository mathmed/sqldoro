import { describe, expect, it, vi } from 'vitest'

import { fakeEngine, fakeSession } from '../../../test/fakes/engine.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { type ConnectionConfig, newConnection } from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import type { Session, SessionRequest } from '../../core/session/open-session.ts'
import {
  ConnectionStatus,
  SessionManager,
  type SessionManagerDependencies,
} from './session-manager.ts'

const CONNECTION: ConnectionConfig = { ...newConnection('a', fakeEngine()), name: 'Shop' }
const SECRETS = new Map([[SecretKind.Password, 's3cret']])

interface Harness {
  readonly sut: SessionManager
  readonly dependencies: SessionManagerDependencies
  readonly requests: SessionRequest[]
  readonly log: ReturnType<typeof recordingLogger>
  readonly onConnectionLost: ReturnType<typeof vi.fn>
}

function session(close = vi.fn(async () => Promise.resolve())): Session {
  return { engine: fakeEngine(), engineSession: fakeSession({ serverVersion: '18.6' }), close }
}

function harness(
  open: (request: SessionRequest) => Promise<Session> = async () => Promise.resolve(session()),
): Harness {
  const requests: SessionRequest[] = []
  const log = recordingLogger()
  const onConnectionLost = vi.fn()
  const dependencies: SessionManagerDependencies = {
    open: async (request) => {
      requests.push(request)
      return open(request)
    },
    readSecrets: async () => Promise.resolve(SECRETS),
    log,
    onConnectionLost,
  }
  return { sut: new SessionManager(dependencies), dependencies, requests, log, onConnectionLost }
}

describe('SessionManager', () => {
  it('should start disconnected', () => {
    const { sut } = harness()

    expect(sut.state('a')).toStrictEqual({
      status: ConnectionStatus.Disconnected,
    })
    expect(sut.session('a')).toBeUndefined()
  })

  it('should connect with the stored secrets and report each status change', async () => {
    const { sut, requests, log } = harness()
    const statuses: string[] = []
    sut.onDidChange((id) => statuses.push(`${id}:${sut.state(id).status}`))

    const opened = await sut.connect(CONNECTION)

    expect(requests[0]).toMatchObject({ connection: CONNECTION, secrets: SECRETS })
    expect(sut.session('a')).toBe(opened)
    expect(sut.state('a')).toStrictEqual({
      status: ConnectionStatus.Connected,
      serverVersion: '18.6',
    })
    expect(statuses).toStrictEqual(['a:connecting', 'a:connected'])
    expect(log.info).toHaveBeenCalledWith('Connected to Shop (FakeSQL 18.6)')
  })

  it('should share one attempt between simultaneous connects and reuse the open session', async () => {
    const { sut, requests } = harness()

    const [first, second] = await Promise.all([sut.connect(CONNECTION), sut.connect(CONNECTION)])
    const third = await sut.connect(CONNECTION)

    expect(first).toBe(second)
    expect(third).toBe(first)
    expect(requests).toHaveLength(1)
  })

  it('should remember why a connection failed and let it be tried again', async () => {
    let attempts = 0
    const { sut, log } = harness(async () => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(new Error('Access denied'))
        : Promise.resolve(session())
    })

    await expect(sut.connect(CONNECTION)).rejects.toThrow('Access denied')

    expect(sut.state('a')).toStrictEqual({
      status: ConnectionStatus.Failed,
      message: 'Access denied',
    })
    expect(log.error).toHaveBeenCalledWith('Could not connect to Shop: Access denied')
    await expect(sut.connect(CONNECTION)).resolves.toBeDefined()
  })

  it('should close the session once on disconnect', async () => {
    const close = vi.fn(async () => Promise.resolve())
    const { sut } = harness(async () => Promise.resolve(session(close)))
    await sut.connect(CONNECTION)

    await Promise.all([sut.disconnect('a'), sut.disconnect('a')])

    expect(close).toHaveBeenCalledOnce()
    expect(sut.state('a').status).toBe(ConnectionStatus.Disconnected)
  })

  it('should wait for a connection in progress before disconnecting it', async () => {
    const close = vi.fn(async () => Promise.resolve())
    const { sut } = harness(async () => Promise.resolve(session(close)))

    const connecting = sut.connect(CONNECTION)
    await sut.disconnect('a')
    await connecting

    expect(close).toHaveBeenCalledOnce()
    expect(sut.session('a')).toBeUndefined()
  })

  it('should disconnect after a failed attempt in progress without failing', async () => {
    const { sut } = harness(async () => Promise.reject(new Error('timeout')))
    const connecting = sut.connect(CONNECTION)

    await expect(sut.disconnect('a')).resolves.toBeUndefined()
    await expect(connecting).rejects.toThrow('timeout')
    expect(sut.state('a').status).toBe(ConnectionStatus.Disconnected)
  })

  it('should log a session that does not close cleanly and forget it anyway', async () => {
    const { sut, log } = harness(async () =>
      Promise.resolve(session(vi.fn(async () => Promise.reject(new Error('socket hang up'))))),
    )
    await sut.connect(CONNECTION)

    await sut.disconnect('a')

    expect(log.warn).toHaveBeenCalledWith('Could not close a session cleanly: socket hang up')
    expect(sut.session('a')).toBeUndefined()
  })

  it('should disconnect every connection', async () => {
    const close = vi.fn(async () => Promise.resolve())
    const { sut } = harness(async () => Promise.resolve(session(close)))
    await sut.connect(CONNECTION)
    await sut.connect({ ...CONNECTION, id: 'b' })

    await sut.disconnectAll()

    expect(close).toHaveBeenCalledTimes(2)
  })

  it('should mark a lost connection as failed, close it and tell the user', async () => {
    const close = vi.fn(async () => Promise.resolve())
    const { sut, requests, log, onConnectionLost } = harness(async () =>
      Promise.resolve(session(close)),
    )
    await sut.connect(CONNECTION)

    requests[0]?.onUnexpectedClose(new Error('server closed the connection'))
    requests[0]?.onUnexpectedClose(new Error('again'))

    expect(sut.state('a')).toStrictEqual({
      status: ConnectionStatus.Failed,
      message: 'Connection lost: server closed the connection',
    })
    expect(sut.session('a')).toBeUndefined()
    expect(close).toHaveBeenCalledOnce()
    expect(log.warn).toHaveBeenCalledWith('Shop: Connection lost: server closed the connection')
    expect(onConnectionLost).toHaveBeenCalledExactlyOnceWith(
      CONNECTION,
      'Connection lost: server closed the connection',
    )
  })

  it('should stop telling its listeners once disposed', async () => {
    const { sut } = harness()
    const listener = vi.fn()
    sut.onDidChange(listener)

    sut.dispose()
    await sut.connect(CONNECTION)

    expect(listener).not.toHaveBeenCalled()
  })
})
