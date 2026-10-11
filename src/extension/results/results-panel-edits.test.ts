import { beforeEach, describe, expect, it } from 'vitest'

import {
  answerOrders,
  cell,
  edit,
  editableResult,
  editingOf,
  ORDERS_QUERY,
} from '../../../test/support/edits.ts'
import { type QueryHarness, queryHarness } from '../../../test/support/query.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import { explain } from '../editor/explain.ts'

let harness: QueryHarness

function sent(): string[] {
  return harness.engine.requests.map((request) => request.sql)
}

const KEEP_CHANGES =
  'Apply or revert the changes first: running the query again would read the rows again and drop them.'

beforeEach(() => {
  resetVscode()
  window.showWarningMessage.mockReset()
  window.showInformationMessage.mockReset()
  harness = queryHarness({ autoLimit: 1000 })
  answerOrders(harness)
})

describe('ResultsPanel, editing', () => {
  it('should drop an edit made on another view of the rows', async () => {
    const result = await editableResult(harness)
    result.tab.applyView({ sort: [{ column: 0, isDescending: true }], filters: [] })

    result.panel.webview.send({
      type: 'edit',
      tabId: result.tab.id,
      viewVersion: 0,
      edit: { kind: EditKind.SetNull, block: cell(0, 2), input: '' },
    })
    await new Promise((resolve) => setImmediate(resolve))

    expect(result.tab.editor.hasChanges).toBe(false)
    expect(harness.log.debug).toHaveBeenCalledWith(
      'An edit of a result that changed since, or cannot be edited, was dropped',
    )
  })

  it('should close the preview, and apply nothing of a preview that is gone', async () => {
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.SetNull, block: cell(1, 2) })
    result.panel.webview.send({ type: 'previewEdits', tabId: result.tab.id })

    result.panel.webview.send({ type: 'closePreview', tabId: result.tab.id })
    result.panel.webview.send({ type: 'applyEdits', tabId: result.tab.id, previewId: 1 })
    result.panel.webview.send({ type: 'closePreview', tabId: 'gone' })
    result.panel.webview.send({ type: 'previewEdits', tabId: 'gone' })
    await new Promise((resolve) => setImmediate(resolve))

    expect(editingOf(result.tab).preview).toBeNull()
    expect(sent()).toStrictEqual([`${ORDERS_QUERY} LIMIT 101`])
  })

  it('should not read the rows again while they have changes', async () => {
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.SetNull, block: cell(1, 2) })

    result.panel.webview.send({ type: 'loadAll', tabId: result.tab.id })
    result.panel.webview.send({
      type: 'setView',
      tabId: result.tab.id,
      view: { sort: [{ column: 0, isDescending: true }], filters: [] },
      isServerSide: true,
    })
    await new Promise((resolve) => setImmediate(resolve))

    expect(sent()).toStrictEqual([`${ORDERS_QUERY} LIMIT 101`])
    expect(editingOf(result.tab)).toMatchObject({ notice: KEEP_CHANGES, isNoticeError: true })
    expect(harness.panels.get(result.editor.document.uri)?.hasChanges()).toBe(true)
  })

  it('should ask before a new run drops the changes, and run once the user agrees', async () => {
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.SetNull, block: cell(1, 2) })
    window.showWarningMessage
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('Drop the Changes and Run')

    await harness.runner.run(result.editor, RunScope.All)
    await explain(harness.runner, result.editor, false)
    await explain(harness.runner, result.editor, false)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'The results of this editor have changes that were not applied.',
      { modal: true, detail: 'Running a query replaces the results, and drops their changes.' },
      'Drop the Changes and Run',
    )
    expect(sent()).toStrictEqual([`${ORDERS_QUERY} LIMIT 101`, `EXPLAIN ${ORDERS_QUERY}`])
  })

  it('should warn that closing the view took its changes away', async () => {
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.SetNull, block: cell(1, 2) })

    result.panel.dispose()

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'The changes in the results of Untitled-1 were not applied: their view was closed.',
    )
  })

  it('should close a view without changes quietly', async () => {
    const result = await editableResult(harness)

    result.panel.dispose()

    expect(window.showWarningMessage).not.toHaveBeenCalled()
    expect(result.editor.document.isClosed).toBe(false)
  })
})
