import type * as vscode from 'vscode'

import type { ResultSet } from '../../core/results/result-set.ts'
import { wasLimited } from '../editor/refresh-rows.ts'
import type { PanelActions } from '../results/panel-actions.ts'
import type { TableContext } from './table-context.ts'
import { readStep } from './table-read.ts'
import { tableSourceOf } from './table-source.ts'

// What a table panel does in place of an editor's panel: it reads the rows of the step it shows
// again, with its WHERE, its view or without the automatic limit, and keeps the layout of its
// columns for its table.
export function tableActions(
  context: TableContext,
  uri: vscode.Uri,
): Pick<PanelActions, 'filterTable' | 'loadAll' | 'refresh' | 'saveLayout' | 'serverView'> {
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
      readStep(context, uri, {
        tab,
        change: { view, columns: tab.columns.map(({ name }) => name) },
        shouldAutoLimit: true,
      }),
    loadAll: async (tab) => readStep(context, uri, { tab, change: {}, shouldAutoLimit: false }),
    saveLayout: async (tab) => saveLayout(context, uri, tab),
  }
}

// The layout is kept for the table the panel shows now, which a navigation in place may have moved.
async function saveLayout(context: TableContext, uri: vscode.Uri, tab: ResultSet): Promise<void> {
  const source = tableSourceOf(context, uri)
  if (source !== undefined) {
    await context.layouts.save(source.connection.id, source.step.table, tab.layout)
  }
}
