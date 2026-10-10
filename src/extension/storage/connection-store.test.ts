import { describe, expect, it, vi } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { type ConnectionConfig, newConnection } from '../../core/connection/connection.ts'
import { ConnectionStore } from './connection-store.ts'

const SHOP: ConnectionConfig = { ...newConnection('a', fakeEngine()), name: 'Shop', user: 'app' }
const BILLING: ConnectionConfig = { ...SHOP, id: 'b', name: 'Billing' }

describe('ConnectionStore', () => {
  it('should start empty', () => {
    const sut = new ConnectionStore(new FakeMemento(), recordingLogger())

    expect(sut.list()).toStrictEqual([])
    expect(sut.problems).toStrictEqual([])
  })

  it('should add, replace and find connections, and keep them for the next session', async () => {
    const memento = new FakeMemento()
    const sut = new ConnectionStore(memento, recordingLogger())

    await sut.save(SHOP)
    await sut.save(BILLING)
    await sut.save({ ...SHOP, name: 'Shop (prod)' })

    expect(sut.list().map((connection) => connection.name)).toStrictEqual([
      'Shop (prod)',
      'Billing',
    ])
    expect(sut.find('b')).toStrictEqual(BILLING)
    expect(sut.find('missing')).toBeUndefined()
    expect(new ConnectionStore(memento, recordingLogger()).list()).toHaveLength(2)
  })

  it('should delete a connection', async () => {
    const sut = new ConnectionStore(new FakeMemento(), recordingLogger())
    await sut.save(SHOP)
    await sut.save(BILLING)

    await sut.delete('a')

    expect(sut.list()).toStrictEqual([BILLING])
  })

  it('should tell its listeners about every change', async () => {
    const sut = new ConnectionStore(new FakeMemento(), recordingLogger())
    const listener = vi.fn()
    sut.onDidChange(listener)

    await sut.save(SHOP)
    await sut.delete('a')

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('should log the connections it cannot read and keep them when it writes', async () => {
    const memento = new FakeMemento()
    await memento.update('sqldoro.connections', { version: 1, connections: [{ id: 'broken' }] })
    const log = recordingLogger()

    const sut = new ConnectionStore(memento, log)
    await sut.save(SHOP)

    expect(log.warn).toHaveBeenCalledWith(
      'Saved connection #1 cannot be read: "name" must be a string',
    )
    expect(memento.get('sqldoro.connections')).toMatchObject({
      connections: [{ id: 'a' }, { id: 'broken' }],
    })
  })

  it('should refuse to overwrite saved connections it cannot read', async () => {
    const memento = new FakeMemento()
    await memento.update('sqldoro.connections', { version: 99, connections: [] })
    const sut = new ConnectionStore(memento, recordingLogger())

    await expect(sut.save(SHOP)).rejects.toThrow(
      'sqldoro cannot change the saved connections because it cannot read them: see the sqldoro output',
    )
    expect(sut.problems).toStrictEqual([
      'The saved connections cannot be read: their format (version 99) is not supported',
    ])
    expect(memento.get('sqldoro.connections')).toStrictEqual({ version: 99, connections: [] })
  })

  it('should stop telling its listeners once disposed', async () => {
    const sut = new ConnectionStore(new FakeMemento(), recordingLogger())
    const listener = vi.fn()
    sut.onDidChange(listener)

    sut.dispose()
    await sut.save(SHOP)

    expect(listener).not.toHaveBeenCalled()
  })
})
