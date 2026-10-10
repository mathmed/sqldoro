import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { historyEntry } from '../../../test/fixtures/history.ts'
import { HistoryStore } from './history-store.ts'

let memento: FakeMemento
let log: ReturnType<typeof recordingLogger>

function ids(store: HistoryStore): string[] {
  return store.list().map((entry) => entry.id)
}

beforeEach(() => {
  memento = new FakeMemento()
  log = recordingLogger()
})

describe('HistoryStore', () => {
  it('should keep the newest entries first, at most the limit per connection, across windows', async () => {
    const sut = new HistoryStore(memento, log, () => 2)
    const changes = vi.fn()
    sut.onDidChange(changes)

    for (const id of ['a', 'b', 'c']) {
      await sut.add(historyEntry(id))
    }

    expect(ids(sut)).toStrictEqual(['c', 'b'])
    expect(ids(new HistoryStore(memento, log, () => 2))).toStrictEqual(['c', 'b'])
    expect(sut.find('b')?.sql).toBe('SELECT b')
    expect(changes).toHaveBeenCalledTimes(3)
  })

  it('should remove an entry, clear everything and drop the history of deleted connections', async () => {
    const sut = new HistoryStore(memento, log, () => 10)
    await sut.add(historyEntry('a'))
    await sut.add(historyEntry('b', { connectionId: 'crm' }))
    await sut.add(historyEntry('c'))

    await sut.remove('c')
    expect(ids(sut)).toStrictEqual(['b', 'a'])
    await sut.retain(new Set(['shop']))
    expect(ids(sut)).toStrictEqual(['a'])
    await sut.clear()
    expect(ids(sut)).toStrictEqual([])
  })

  it('should not write when nothing changes', async () => {
    const sut = new HistoryStore(memento, log, () => 10)
    await sut.add(historyEntry('a'))
    const update = vi.spyOn(memento, 'update')

    await sut.retain(new Set(['shop']))
    await sut.add(historyEntry('long', { sql: ' ' }))

    expect(update).not.toHaveBeenCalled()
  })

  it('should log the entries it cannot read and keep them', async () => {
    await memento.update('sqldoro.history', { version: 1, entries: [{ id: 1 }] })

    const sut = new HistoryStore(memento, log, () => 10)
    await sut.add(historyEntry('a'))

    expect(log.warn).toHaveBeenCalledWith('History entry #1 cannot be read: "id" must be a string')
    expect(memento.get('sqldoro.history')).toMatchObject({ entries: [{ id: 'a' }, { id: 1 }] })
  })

  it('should refuse to overwrite a history it cannot read', async () => {
    await memento.update('sqldoro.history', { version: 7, entries: [] })
    const sut = new HistoryStore(memento, log, () => 10)

    await expect(sut.add(historyEntry('a'))).rejects.toThrow(
      'sqldoro cannot change the query history because it cannot read it: see the sqldoro output',
    )
  })

  it('should stop telling about changes once disposed', async () => {
    const sut = new HistoryStore(memento, log, () => 10)
    const changes = vi.fn()
    sut.onDidChange(changes)

    sut.dispose()
    await sut.add(historyEntry('a'))

    expect(changes).not.toHaveBeenCalled()
  })
})
