import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { savedQuery } from '../../../test/fixtures/saved-queries.ts'
import { answerInputs, answerQuickPicks } from '../../../test/support/prompts.ts'
import {
  type QueryHarness,
  queryHarness,
  SHOP_BINDING,
  sqlEditor,
} from '../../../test/support/query.ts'
import { resetVscode, showEditor, Uri, window, workspace } from '../../../test/vscode.ts'
import { exportQueries } from '../../core/snippets/saved-queries.ts'
import { CommandId } from '../command-id.ts'
import { registerSavedQueryCommands } from './saved-query-commands.ts'
import { SavedQueryStore } from './saved-query-store.ts'

const encoder = new TextEncoder()
let harness: QueryHarness
let store: SavedQueryStore
let log: ReturnType<typeof recordingLogger>
let disposables: vscode.Disposable[]
let ids: number

function node(id: string): unknown {
  return { kind: 'savedQuery', query: store.find(id) }
}

beforeEach(async () => {
  resetVscode()
  for (const prompt of [
    window.showQuickPick,
    window.showInputBox,
    window.showWarningMessage,
    window.showInformationMessage,
    window.showOpenDialog,
    window.showSaveDialog,
    workspace.fs.writeFile,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness()
  log = recordingLogger()
  store = new SavedQueryStore(new FakeMemento(), log)
  await store.replaceAll([
    savedQuery('a', { name: 'Totals', folder: 'reports', sql: 'SELECT sum(total) FROM orders' }),
  ])
  ids = 0
  disposables = registerSavedQueryCommands({
    store,
    bindings: harness.bindings,
    clock: { now: () => 0, timestamp: () => '2026-10-11T00:00:00.000Z' },
    createId: () => {
      ids += 1
      return `new-${String(ids)}`
    },
    log,
  })
})

afterEach(() => {
  for (const disposable of disposables) {
    disposable.dispose()
  }
})

describe('Save Query', () => {
  it('should save the selection under a name, in a folder', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1; SELECT 2;')
    editor.select(10, 18)
    answerInputs('Second ')
    answerQuickPicks('reports')

    await vscode.commands.executeCommand(CommandId.SaveQuery)

    expect(store.find('new-1')).toStrictEqual({
      id: 'new-1',
      name: 'Second',
      folder: 'reports',
      sql: 'SELECT 2',
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
    })
  })

  it('should save the whole editor in a new folder, with a free name', async () => {
    await sqlEditor(harness, '  SELECT 3  ')
    answerInputs('Totals', ' reports / yearly ')
    answerQuickPicks('New Folder…')

    await vscode.commands.executeCommand(CommandId.SaveQuery)

    expect(store.find('new-1')).toMatchObject({
      name: 'Totals',
      folder: 'reports/yearly',
      sql: 'SELECT 3',
    })
  })

  it('should number a name taken in the folder, and save at the top level', async () => {
    await store.put(savedQuery('b', { name: 'Users' }))
    await sqlEditor(harness, 'SELECT 4')
    answerInputs('users')
    answerQuickPicks('Top level')

    await vscode.commands.executeCommand(CommandId.SaveQuery)

    expect(store.find('new-1')).toMatchObject({ name: 'users (2)', folder: '' })
  })

  it.each([
    ['the name', [undefined], []],
    ['the folder', ['Name'], [undefined]],
    ['the new folder', ['Name', undefined], ['New Folder…']],
  ])('should save nothing when %s is dismissed', async (...[, inputs, picks]) => {
    await sqlEditor(harness, 'SELECT 5')
    answerInputs(...inputs)
    answerQuickPicks(...picks)

    await vscode.commands.executeCommand(CommandId.SaveQuery)

    expect(store.list()).toHaveLength(1)
  })

  it('should need a SQL editor with a statement', async () => {
    await sqlEditor(harness, '   ')
    await vscode.commands.executeCommand(CommandId.SaveQuery)
    showEditor(await workspace.openTextDocument({ language: 'markdown', content: 'x' }))
    await vscode.commands.executeCommand(CommandId.SaveQuery)

    expect(window.showInformationMessage).toHaveBeenCalledTimes(2)
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Open a SQL editor with a statement to save.',
    )
  })
})

describe('using saved queries', () => {
  it('should open a query on the connection of the SQL editor in front', async () => {
    await sqlEditor(harness, 'SELECT 1')

    await vscode.commands.executeCommand(CommandId.OpenSavedQuery, node('a'))

    const editor = window.activeTextEditor
    expect(editor?.document.getText()).toBe('SELECT sum(total) FROM orders')
    expect(harness.bindings.get(editor?.document.uri as unknown as vscode.Uri)).toStrictEqual(
      SHOP_BINDING,
    )
  })

  it('should open a query without a connection when no editor is in front, picked from the palette', async () => {
    answerQuickPicks('Totals')

    await vscode.commands.executeCommand(CommandId.OpenSavedQuery)

    expect(
      harness.bindings.get(window.activeTextEditor?.document.uri as unknown as vscode.Uri),
    ).toBeUndefined()
  })

  it('should insert a query in place of the selection of the SQL editor', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1; SELECT 2')
    editor.select(10, 18)

    await vscode.commands.executeCommand(CommandId.InsertSavedQuery, node('a'))

    expect(editor.document.getText()).toBe('SELECT 1; SELECT sum(total) FROM orders')
  })

  it('should need a SQL editor to insert a query in', async () => {
    await vscode.commands.executeCommand(CommandId.InsertSavedQuery, node('a'))

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Open the SQL editor to insert the query in first.',
    )
  })

  it('should say there is nothing to pick yet', async () => {
    await store.delete('a')

    await vscode.commands.executeCommand(CommandId.OpenSavedQuery)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'There is no saved query yet: save one from a SQL editor.',
    )
  })

  it('should do nothing for a query that is gone', async () => {
    const gone = node('a')
    await store.delete('a')

    await vscode.commands.executeCommand(CommandId.OpenSavedQuery, gone)

    expect(window.activeTextEditor).toBeUndefined()
  })
})

describe('organizing saved queries', () => {
  it('should rename a query, keeping names unique in its folder', async () => {
    await store.put(savedQuery('b', { name: 'Totals 2', folder: 'reports' }))
    answerInputs('Totals 2', 'Totals', ' Sums ')

    await vscode.commands.executeCommand(CommandId.RenameSavedQuery, node('a'))
    expect(store.find('a')).toMatchObject({
      name: 'Totals 2 (2)',
      updatedAt: '2026-10-11T00:00:00.000Z',
    })
    await vscode.commands.executeCommand(CommandId.RenameSavedQuery, node('a'))
    await vscode.commands.executeCommand(CommandId.RenameSavedQuery, node('a'))

    expect(store.find('a')?.name).toBe('Sums')
  })

  it('should keep a query whose new name is the same or dismissed', async () => {
    answerInputs('Totals', undefined)

    await vscode.commands.executeCommand(CommandId.RenameSavedQuery, node('a'))
    await vscode.commands.executeCommand(CommandId.RenameSavedQuery, node('a'))

    expect(store.find('a')).toMatchObject({ name: 'Totals', updatedAt: '2026-10-10T03:00:00.000Z' })
  })

  it('should move a query to another folder', async () => {
    await store.put(savedQuery('b', { folder: 'reports' }))
    answerQuickPicks('Top level', 'reports', undefined)

    await vscode.commands.executeCommand(CommandId.MoveSavedQuery, node('a'))
    expect(store.find('a')?.folder).toBe('')
    await vscode.commands.executeCommand(CommandId.MoveSavedQuery, node('a'))
    await vscode.commands.executeCommand(CommandId.MoveSavedQuery, node('a'))

    expect(store.find('a')).toMatchObject({
      folder: 'reports',
      updatedAt: '2026-10-11T00:00:00.000Z',
    })
  })

  it('should delete a query once the user agrees', async () => {
    window.showWarningMessage.mockResolvedValueOnce(undefined).mockResolvedValueOnce('Delete')

    await vscode.commands.executeCommand(CommandId.DeleteSavedQuery, node('a'))
    expect(store.list()).toHaveLength(1)
    await vscode.commands.executeCommand(CommandId.DeleteSavedQuery, node('a'))

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Delete the saved query "Totals"?',
      { modal: true },
      'Delete',
    )
    expect(store.list()).toStrictEqual([])
  })
})

describe('Export and Import', () => {
  it('should export every saved query to the file the user picks', async () => {
    window.showSaveDialog.mockResolvedValueOnce(Uri.file('/work/queries.json'))

    await vscode.commands.executeCommand(CommandId.ExportSavedQueries)
    await vscode.commands.executeCommand(CommandId.ExportSavedQueries)

    expect(workspace.fs.writeFile).toHaveBeenCalledExactlyOnceWith(
      Uri.file('/work/queries.json'),
      encoder.encode(exportQueries(store.list())),
    )
    expect(window.showInformationMessage).toHaveBeenCalledWith('Exported 1 saved queries.')
  })

  it('should import the queries of a file, reporting what it cannot read', async () => {
    const file = JSON.stringify({
      kind: 'sqldoro.savedQueries',
      version: 1,
      queries: [savedQuery('x', { name: 'Totals', folder: 'reports' }), { id: 1 }],
    })
    window.showOpenDialog.mockResolvedValueOnce([Uri.file('/work/in.json')])
    vi.spyOn(workspace.fs, 'readFile').mockResolvedValueOnce(encoder.encode(file))

    await vscode.commands.executeCommand(CommandId.ImportSavedQueries)

    expect(store.list().map((query) => [query.id, query.name])).toStrictEqual([
      ['a', 'Totals'],
      ['new-1', 'Totals (2)'],
    ])
    expect(log.warn).toHaveBeenCalledWith('Saved query #2 cannot be read: "id" must be a string')
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Imported 1 saved queries. Saved query #2 cannot be read: "id" must be a string',
    )
  })

  it('should import nothing from a file that holds no saved queries, nor without a file', async () => {
    window.showOpenDialog
      .mockResolvedValueOnce([Uri.file('/work/in.json')])
      .mockResolvedValueOnce(undefined)
    vi.spyOn(workspace.fs, 'readFile').mockResolvedValueOnce(encoder.encode('[]'))
    const write = vi.spyOn(store, 'replaceAll')

    await vscode.commands.executeCommand(CommandId.ImportSavedQueries)
    await vscode.commands.executeCommand(CommandId.ImportSavedQueries)

    expect(write).not.toHaveBeenCalled()
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Imported 0 saved queries. The file does not hold queries saved by sqldoro',
    )
  })

  it('should say how many queries a clean file brought', async () => {
    window.showOpenDialog.mockResolvedValueOnce([Uri.file('/work/in.json')])
    vi.spyOn(workspace.fs, 'readFile').mockResolvedValueOnce(
      encoder.encode(exportQueries([savedQuery('y')])),
    )

    await vscode.commands.executeCommand(CommandId.ImportSavedQueries)

    expect(window.showInformationMessage).toHaveBeenCalledWith('Imported 1 saved queries.')
  })
})
