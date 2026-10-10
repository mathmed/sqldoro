import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import {
  type QueryHarness,
  queryHarness,
  SHOP_BINDING,
  sqlEditor,
} from '../../../test/support/query.ts'
import { MYSQL_ENGINE, POSTGRES_ENGINE } from '../../../test/support/query.ts'
import {
  contextKeys,
  resetVscode,
  showEditor,
  statusBarItems,
  workspace,
} from '../../../test/vscode.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { EditorStatus } from './editor-status.ts'

let harness: QueryHarness
let sut: EditorStatus

beforeEach(() => {
  resetVscode()
  harness = queryHarness()
  sut = new EditorStatus({
    bindings: harness.bindings,
    runner: harness.runner,
    connections: (id) => harness.connections.get(id),
    engines: new EngineRegistry([POSTGRES_ENGINE, MYSQL_ENGINE]),
  })
})

function item(): (typeof statusBarItems)[number] {
  const found = statusBarItems.at(-1)
  if (found === undefined) {
    throw new Error('no status bar item')
  }
  return found
}

describe('EditorStatus', () => {
  it('should hide for editors that are not SQL', async () => {
    showEditor(await workspace.openTextDocument({ language: 'markdown', content: '# x' }))

    sut.update()

    expect(item()).toMatchObject({ isVisible: false, name: 'sqldoro Connection' })
    expect(contextKeys.get('sqldoro.editorHasConnection')).toBe(false)
    expect(contextKeys.get('sqldoro.isQueryRunning')).toBe(false)
  })

  it('should offer to choose the connection of a SQL editor without one', async () => {
    await sqlEditor(harness, 'SELECT 1', null)

    sut.update()

    expect(item()).toMatchObject({
      isVisible: true,
      text: '$(plug) Choose a connection',
      tooltip: 'Choose the connection of this SQL editor',
      command: 'sqldoro.changeConnection',
    })
    expect(contextKeys.get('sqldoro.editorHasConnection')).toBe(false)
  })

  it('should name the connection, database and schema of the editor', async () => {
    await sqlEditor(harness, 'SELECT 1', SHOP_BINDING)

    sut.update()

    expect(item()).toMatchObject({
      text: '$(database) Shop › shop.sales',
      tooltip: 'This editor runs on Shop › shop.sales: click to change',
      command: 'sqldoro.changeConnection',
    })
    expect(contextKeys.get('sqldoro.editorHasConnection')).toBe(true)
  })

  it('should treat a connection that is gone as no connection', async () => {
    await sqlEditor(harness, 'SELECT 1', { connectionId: 'gone', database: '', schema: '' })

    sut.update()

    expect(item().text).toBe('$(plug) Choose a connection')
  })

  it('should offer to cancel the query that runs', async () => {
    harness.engine.answer = () => ({ isPending: true })
    const editor = await sqlEditor(harness, 'SELECT pg_sleep(9)', SHOP_BINDING)
    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(1)
    })

    sut.update()

    expect(item()).toMatchObject({
      text: '$(loading~spin) Shop',
      tooltip: 'A query is running: click to cancel it',
      command: 'sqldoro.cancelQuery',
    })
    expect(contextKeys.get('sqldoro.isQueryRunning')).toBe(true)
    await harness.runner.cancel(editor.document.uri as unknown as vscode.Uri)
    await running
  })

  it('should show a running query of an editor without a connection anymore', async () => {
    harness.engine.answer = () => ({ isPending: true })
    const editor = await sqlEditor(harness, 'SELECT 1', SHOP_BINDING)
    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(1)
    })
    harness.connections.delete('shop')

    sut.update()

    expect(item().text).toBe('$(loading~spin) ')
    await harness.runner.cancel(editor.document.uri as unknown as vscode.Uri)
    await running
  })

  it('should give its item back when disposed', () => {
    sut.dispose()

    expect(item().dispose).toHaveBeenCalledOnce()
  })
})
