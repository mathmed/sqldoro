import * as vscode from 'vscode'

import { hiddenCount } from '../../core/grid/column-layout.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { namedView } from '../../core/results/server-view.ts'
import { tableEditorSql } from '../../core/results/table-query.ts'
import type { EditorBindings } from '../editor/bindings.ts'
import { openQueryEditor } from '../editor/open-editor.ts'
import { parameterTypesOf } from '../metadata/parameter-types.ts'
import type { TableContext } from './table-context.ts'
import { tableSourceOf } from './table-source.ts'
import { tableBinding } from './table-uri.ts'

export interface TableEditorContext extends TableContext {
  readonly bindings: EditorBindings
}

const NO_VIEW = { filters: [], sort: [] }

// The statement of a table panel in a new SQL editor, on the connection, database and schema of the
// panel: what the panel runs, with its key, its WHERE, its filters and its sort, the values written
// in it, and the columns the grid shows when it hides some. The editor gives it the automatic limit
// again when it runs, through the guards like anything typed there.
export async function openTableInEditor(
  context: TableEditorContext,
  uri: vscode.Uri,
  tab: ResultSet,
): Promise<void> {
  const source = tableSourceOf(context, uri)
  if (source === undefined) {
    return
  }
  const { step, connection, engine } = source
  const parameterTypes = await parameterTypesOf(context, { connection, engine }, step.table)
  const columns = step.columns.map((name) => ({ name }))
  const view = namedView(step.view, { columns, parameterTypes }) ?? NO_VIEW
  const query = tableEditorSql({ ...step, view, parameterTypes }, engine.dialect, shownNames(tab))
  if ('problem' in query) {
    void vscode.window.showWarningMessage(query.problem)
    return
  }
  await openQueryEditor(context.bindings, query.sql, tableBinding(uri))
}

// The columns the grid shows, in its order, when it hides some; none (every column) otherwise.
function shownNames(tab: ResultSet): string[] {
  if (hiddenCount(tab.columns, tab.layout) === 0) {
    return []
  }
  return tab.shownColumns.flatMap((index) =>
    tab.columns.slice(index, index + 1).map(({ name }) => name),
  )
}
