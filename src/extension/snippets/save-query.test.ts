import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { historyEntry } from '../../../test/fixtures/history.ts'
import { savedQuery } from '../../../test/fixtures/saved-queries.ts'
import { answerInputs, answerQuickPicks } from '../../../test/support/prompts.ts'
import { type QueryHarness, queryHarness, sqlEditor } from '../../../test/support/query.ts'
import {
  type FakeTextEditor,
  resetVscode,
  showEditor,
  window,
  workspace,
} from '../../../test/vscode.ts'
import { saveQuery, saveQueryAs, type SaveQueryContext } from './save-query.ts'
import { SavedQueryLinks } from './saved-query-links.ts'
import { SavedQueryStore } from './saved-query-store.ts'

const TOTALS_SQL = 'SELECT sum(total) FROM orders'
const NOW = '2026-10-11T00:00:00.000Z'
let harness: QueryHarness
let store: SavedQueryStore
let links: SavedQueryLinks
let context: SaveQueryContext
let ids: number

function uriOf(editor: FakeTextEditor): vscode.Uri {
  return editor.document.uri as unknown as vscode.Uri
}

// A SQL editor opened from the saved query "Totals", then edited.
async function totalsEditor(text: string): Promise<FakeTextEditor> {
  const editor = await sqlEditor(harness, text)
  links.link(uriOf(editor), 'a')
  return editor
}

beforeEach(async () => {
  resetVscode()
  for (const prompt of [
    window.showQuickPick,
    window.showInputBox,
    window.showInformationMessage,
    window.setStatusBarMessage,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness()
  store = new SavedQueryStore(new FakeMemento(), recordingLogger())
  await store.replaceAll([savedQuery('a', { name: 'Totals', folder: 'reports', sql: TOTALS_SQL })])
  links = new SavedQueryLinks()
  ids = 0
  context = {
    store,
    links,
    clock: { now: () => 0, timestamp: () => NOW },
    createId: () => {
      ids += 1
      return `new-${String(ids)}`
    },
  }
})

describe('saveQuery from a SQL editor', () => {
  it('should save the selection under a name, in a folder, leaving the editor unlinked', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1; SELECT 2;')
    editor.select(10, 18)
    answerInputs('Second ')
    answerQuickPicks('reports')

    await saveQuery(context, undefined)

    expect(store.find('new-1')).toStrictEqual({
      id: 'new-1',
      name: 'Second',
      folder: 'reports',
      sql: 'SELECT 2',
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(links.queryOf(uriOf(editor))).toBeUndefined()
    expect(window.setStatusBarMessage).toHaveBeenCalledWith(
      '$(check) Saved the query "Second"',
      4000,
    )
  })

  it('should save the whole editor in a new folder, with a free name, and link the editor to it', async () => {
    const editor = await sqlEditor(harness, '  SELECT 3  ')
    answerInputs('Totals', ' reports / yearly ')
    answerQuickPicks('New Folder…')

    await saveQuery(context, undefined)

    expect(store.find('new-1')).toMatchObject({
      name: 'Totals',
      folder: 'reports/yearly',
      sql: 'SELECT 3',
    })
    expect(links.queryOf(uriOf(editor))).toBe('new-1')
    expect(window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save Query', value: '' }),
    )
  })

  it('should number a name taken in the folder, and save at the top level', async () => {
    await store.put(savedQuery('b', { name: 'Users' }))
    await sqlEditor(harness, 'SELECT 4')
    answerInputs('users')
    answerQuickPicks('Top level')

    await saveQuery(context, undefined)

    expect(store.find('new-1')).toMatchObject({ name: 'users (2)', folder: '' })
  })

  it.each([
    ['the name', [undefined], []],
    ['the folder', ['Name'], [undefined]],
    ['the new folder', ['Name', undefined], ['New Folder…']],
  ])('should save nothing when %s is dismissed', async (...[, inputs, picks]) => {
    const editor = await sqlEditor(harness, 'SELECT 5')
    answerInputs(...inputs)
    answerQuickPicks(...picks)

    await saveQuery(context, undefined)

    expect(store.list()).toHaveLength(1)
    expect(links.queryOf(uriOf(editor))).toBeUndefined()
  })

  it('should need a SQL editor with a statement', async () => {
    await sqlEditor(harness, '   ')
    await saveQuery(context, undefined)
    showEditor(await workspace.openTextDocument({ language: 'markdown', content: 'x' }))
    await saveQuery(context, undefined)

    expect(window.showInformationMessage).toHaveBeenCalledTimes(2)
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Open a SQL editor with a statement to save.',
    )
  })
})

describe('saveQuery from the editor of a saved query', () => {
  it('should update the saved query with the whole editor, without asking', async () => {
    const editor = await totalsEditor(' SELECT sum(total), count(*) FROM orders ')
    editor.select(1, 7)

    await saveQuery(context, undefined)

    expect(store.list()).toStrictEqual([
      savedQuery('a', {
        name: 'Totals',
        folder: 'reports',
        sql: 'SELECT sum(total), count(*) FROM orders',
        updatedAt: NOW,
      }),
    ])
    expect(window.showInputBox).not.toHaveBeenCalled()
    expect(window.showQuickPick).not.toHaveBeenCalled()
    expect(window.setStatusBarMessage).toHaveBeenCalledWith(
      '$(check) Saved the query "Totals"',
      4000,
    )
  })

  it('should change nothing when the editor holds the saved SQL', async () => {
    await totalsEditor(`${TOTALS_SQL}\n`)
    const write = vi.spyOn(store, 'put')

    await saveQuery(context, undefined)

    expect(write).not.toHaveBeenCalled()
    expect(window.setStatusBarMessage).toHaveBeenCalledOnce()
  })

  it('should not empty the saved query from an empty editor', async () => {
    await totalsEditor('  ')

    await saveQuery(context, undefined)

    expect(store.find('a')?.sql).toBe(TOTALS_SQL)
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Open a SQL editor with a statement to save.',
    )
  })

  it('should save a new query when the saved one is gone', async () => {
    const editor = await sqlEditor(harness, 'SELECT 6')
    links.link(uriOf(editor), 'gone')
    answerInputs('Again')
    answerQuickPicks('Top level')

    await saveQuery(context, undefined)

    expect(store.find('new-1')).toMatchObject({ name: 'Again', sql: 'SELECT 6' })
    expect(links.queryOf(uriOf(editor))).toBe('new-1')
  })
})

describe('saveQuery from the query history', () => {
  it('should save the statement under a name taken from its SQL', async () => {
    const entry = historyEntry('h', { sql: 'SELECT *\n  FROM orders' })
    answerInputs('SELECT * FROM orders')
    answerQuickPicks('reports')

    await saveQuery(context, { kind: 'historyEntry', entry })

    expect(window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save Query', value: 'SELECT * FROM orders' }),
    )
    expect(store.find('new-1')).toMatchObject({
      name: 'SELECT * FROM orders',
      folder: 'reports',
      sql: 'SELECT *\n  FROM orders',
    })
  })
})

describe('saveQueryAs', () => {
  it('should save the editor of a saved query as a new one, and edit the new one from then on', async () => {
    const editor = await totalsEditor('SELECT max(total) FROM orders')
    answerInputs('Totals')
    answerQuickPicks('reports')

    await saveQueryAs(context)

    expect(window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save Query As', value: 'Totals' }),
    )
    expect(store.find('a')?.sql).toBe(TOTALS_SQL)
    expect(store.find('new-1')).toMatchObject({
      name: 'Totals (2)',
      folder: 'reports',
      sql: 'SELECT max(total) FROM orders',
    })
    expect(links.queryOf(uriOf(editor))).toBe('new-1')
  })

  it('should keep the editor on its saved query when only the selection is saved', async () => {
    const editor = await totalsEditor('SELECT 1; SELECT 2')
    editor.select(10, 18)
    answerInputs('Second')
    answerQuickPicks('Top level')

    await saveQueryAs(context)

    expect(store.find('new-1')?.sql).toBe('SELECT 2')
    expect(links.queryOf(uriOf(editor))).toBe('a')
  })

  it('should start from an empty name in any other SQL editor, and need one', async () => {
    await sqlEditor(harness, 'SELECT 7')
    answerInputs(undefined)

    await saveQueryAs(context)
    showEditor(await workspace.openTextDocument({ language: 'markdown', content: 'x' }))
    await saveQueryAs(context)

    expect(window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save Query As', value: '' }),
    )
    expect(store.list()).toHaveLength(1)
    expect(window.showInformationMessage).toHaveBeenCalledExactlyOnceWith(
      'Open a SQL editor with a statement to save.',
    )
  })
})
