import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { savedQuery } from '../../../test/fixtures/saved-queries.ts'
import { SavedQueryStore } from './saved-query-store.ts'

let memento: FakeMemento
let log: ReturnType<typeof recordingLogger>

beforeEach(() => {
  memento = new FakeMemento()
  log = recordingLogger()
})

describe('SavedQueryStore', () => {
  it('should add, replace and delete queries, across windows', async () => {
    const sut = new SavedQueryStore(memento, log)
    const changes = vi.fn()
    sut.onDidChange(changes)

    await sut.put(savedQuery('a'))
    await sut.put(savedQuery('b'))
    await sut.put(savedQuery('a', { name: 'Renamed' }))
    await sut.delete('b')

    expect(sut.list()).toStrictEqual([savedQuery('a', { name: 'Renamed' })])
    expect(sut.find('a')?.name).toBe('Renamed')
    expect(new SavedQueryStore(memento, log).list()).toStrictEqual(sut.list())
    expect(changes).toHaveBeenCalledTimes(4)
  })

  it('should log the entries it cannot read and keep them', async () => {
    await memento.update('sqldoro.savedQueries', { version: 1, queries: [{ id: 'x' }] })

    const sut = new SavedQueryStore(memento, log)
    await sut.replaceAll([savedQuery('a')])

    expect(log.warn).toHaveBeenCalledWith('Saved query #1 cannot be read: "name" must be a string')
    expect(memento.get('sqldoro.savedQueries')).toMatchObject({
      queries: [{ id: 'a' }, { id: 'x' }],
    })
  })

  it('should refuse to overwrite saved queries it cannot read', async () => {
    await memento.update('sqldoro.savedQueries', { version: 3, queries: [] })

    await expect(new SavedQueryStore(memento, log).put(savedQuery('a'))).rejects.toThrow(
      'sqldoro cannot change the saved queries because it cannot read them: see the sqldoro output',
    )
  })

  it('should stop telling about changes once disposed', async () => {
    const sut = new SavedQueryStore(memento, log)
    const changes = vi.fn()
    sut.onDidChange(changes)

    sut.dispose()
    await sut.put(savedQuery('a'))

    expect(changes).not.toHaveBeenCalled()
  })
})
