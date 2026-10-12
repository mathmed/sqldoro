import type * as vscode from 'vscode'

import type { ResultSet } from '../../core/results/result-set.ts'
import { describeError } from '../../core/text/errors.ts'
import { wasLimited } from '../editor/refresh-rows.ts'
import type { PanelActions } from '../results/panel-actions.ts'
import { openSqlInEditor, type TableEditorContext } from './open-in-editor.ts'
import { runBoxQuery } from './query-box.ts'
import type { TableContext } from './table-context.ts'
import { readStep } from './table-read.ts'
import { tableSourceOf } from './table-source.ts'

type TableActions = Pick<
  PanelActions,
  | 'filterTable'
  | 'loadAll'
  | 'openSqlInEditor'
  | 'refresh'
  | 'runQuery'
  | 'saveLayout'
  | 'serverView'
  | 'setQueryHeight'
>

// What a table panel does in place of an editor's panel: it reads the rows of the step it shows
// again, with its WHERE, its view or without the automatic limit, keeps the layout of its columns
// for its table, and runs the query of its query box. The result of a query of the box is sorted,
// filtered and read whole as the result of an editor is (`query`).
export function tableActions(
  context: TableContext & Pick<TableEditorContext, 'bindings'>,
  uri: vscode.Uri,
  query: Pick<PanelActions, 'loadAll' | 'serverView'>,
): TableActions {
  return {
    refresh: async (tab) =>
      readStep(context, uri, { tab, change: {}, shouldAutoLimit: wasLimited(tab) }),
    filterTable: async (tab, condition) =>
      readStep(context, uri, {
        tab,
        change: { condition: condition.trim() },
        shouldAutoLimit: true,
      }),
    serverView: async (tab, view) =>
      tab.canRefresh
        ? readStep(context, uri, {
            tab,
            change: { view, columns: tab.columns.map(({ name }) => name) },
            shouldAutoLimit: true,
          })
        : query.serverView(tab, view),
    loadAll: async (tab) =>
      tab.canRefresh
        ? readStep(context, uri, { tab, change: {}, shouldAutoLimit: false })
        : query.loadAll(tab),
    saveLayout: async (tab) => saveLayout(context, uri, tab),
    ...queryBoxActions(context, uri),
  }
}

function queryBoxActions(
  context: TableContext & Pick<TableEditorContext, 'bindings'>,
  uri: vscode.Uri,
): Pick<PanelActions, 'openSqlInEditor' | 'runQuery' | 'setQueryHeight'> {
  return {
    runQuery: async (sql) => runBoxQuery(context, uri, sql),
    openSqlInEditor: async (sql) => openSqlInEditor(context, uri, sql),
    setQueryHeight: async (height) => {
      await context.queryHeight.set(height).catch((error: unknown) => {
        context.log.warn(`Could not keep the height of the query box: ${describeError(error)}`)
      })
    },
  }
}

// The layout is kept for the table the panel shows now, which a navigation in place may have moved;
// the columns of the result of a query are not those of the table.
async function saveLayout(context: TableContext, uri: vscode.Uri, tab: ResultSet): Promise<void> {
  const source = tableSourceOf(context, uri)
  if (source !== undefined && tab.canRefresh) {
    await context.layouts.save(source.connection.id, source.step.table, tab.layout)
  }
}
