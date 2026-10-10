import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { savedQuery } from '../../../test/fixtures/saved-queries.ts'
import { type MarkdownString, ThemeIcon } from '../../../test/vscode.ts'
import { SavedQueryStore } from './saved-query-store.ts'
import { SavedQueryNodeKind, SavedQueryView } from './saved-query-view.ts'

let store: SavedQueryStore
let sut: SavedQueryView

beforeEach(async () => {
  store = new SavedQueryStore(new FakeMemento(), recordingLogger())
  sut = new SavedQueryView(store)
  await store.replaceAll([
    savedQuery('a', {
      name: 'Totals',
      folder: 'reports/monthly',
      sql: `SELECT\n  ${'x'.repeat(70)}`,
    }),
    savedQuery('b', { name: 'Users' }),
  ])
})

describe('SavedQueryView', () => {
  it('should list folders, then queries, folder by folder', () => {
    const top = sut.getChildren()
    const reports = top.at(0)

    expect(top).toStrictEqual([
      { kind: SavedQueryNodeKind.Folder, path: 'reports' },
      { kind: SavedQueryNodeKind.Query, query: savedQuery('b', { name: 'Users' }) },
    ])
    expect(sut.getChildren(reports).at(0)).toStrictEqual({
      kind: SavedQueryNodeKind.Folder,
      path: 'reports/monthly',
    })
    expect(
      sut.getChildren({ kind: SavedQueryNodeKind.Query, query: savedQuery('b') }),
    ).toStrictEqual([])
  })

  it('should show a folder by its last part, open', () => {
    expect(
      sut.getTreeItem({ kind: SavedQueryNodeKind.Folder, path: 'reports/monthly' }),
    ).toMatchObject({
      label: 'monthly',
      collapsibleState: 2,
      contextValue: 'savedQueryFolder',
      iconPath: new ThemeIcon('folder'),
    })
  })

  it('should show a query with the start of its statement and open it on click', () => {
    const query = savedQuery('a', { name: 'Totals', sql: `SELECT\n  ${'x'.repeat(70)}` })

    const item = sut.getTreeItem({ kind: SavedQueryNodeKind.Query, query })

    expect(item).toMatchObject({
      label: 'Totals',
      description: `SELECT ${'x'.repeat(52)}…`,
      contextValue: 'savedQuery',
      command: { command: 'sqldoro.openSavedQuery', arguments: [{ kind: 'savedQuery', query }] },
    })
    expect((item.tooltip as MarkdownString).value).toBe(`\n\`\`\`sql\n${query.sql}\n\`\`\`\n`)
    expect(
      sut.getTreeItem({ kind: SavedQueryNodeKind.Query, query: savedQuery('b') }).description,
    ).toBe('SELECT b')
  })

  it('should refresh when the queries change, until disposed', async () => {
    const changes = vi.fn()
    sut.onDidChangeTreeData(changes)

    await store.put(savedQuery('c'))
    sut.dispose()
    await store.put(savedQuery('d'))

    expect(changes).toHaveBeenCalledOnce()
  })
})
