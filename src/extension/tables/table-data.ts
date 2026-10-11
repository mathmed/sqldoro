import * as vscode from 'vscode'

import { startNavigation } from '../../core/navigation/history.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { tableDataQuery } from '../../core/results/table-data.ts'
import { CommandId } from '../command-id.ts'
import { registerAll } from '../commands/command-context.ts'
import type { ResultsPanel } from '../results/results-panel.ts'
import { isObjectNode } from '../tree/explorer-node.ts'
import type { TableContext } from './table-context.ts'
import { readStep } from './table-read.ts'
import { tableSourceOf } from './table-source.ts'
import { tableUri } from './table-uri.ts'

const NOT_A_TABLE = 'Open Table Data works on a table or a view of the Connections view.'
const NOT_READ = 'sqldoro did not read the rows of this table: Refresh reads them.'
const NO_CONNECTION = 'The connection of this table no longer exists.'

export function registerTableDataCommands(context: TableContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.OpenTableData, action: 'Open Table Data', run: openTableData },
  ])
}

// From a table or view of the explorer: its rows in a panel of their own, read like any query (the
// guards, the automatic limit, the editing of the rows). A table already open is shown again, not
// read again: its panel reads it again on Refresh.
async function openTableData(context: TableContext, argument: unknown): Promise<void> {
  if (!isObjectNode(argument) || argument.place === undefined) {
    void vscode.window.showInformationMessage(NOT_A_TABLE)
    return
  }
  const table = argument.place
  const uri = tableUri({ connectionId: argument.connectionId, table, instance: '' })
  const open = context.panels.get(uri)
  if (open !== undefined) {
    open.reveal()
    return
  }
  context.navigations.set(uri, startNavigation({ table, key: undefined }))
  await showStep(context, uri)
}

// The rows of the step a table panel shows, in a new tab of its panel (which opens if it is not
// open yet). The panel and its tab exist at once (a second click finds them), and show what stopped
// the read if it could not run.
export async function showStep(context: TableContext, uri: vscode.Uri): Promise<void> {
  const source = tableSourceOf(context, uri)
  if (source === undefined) {
    void vscode.window.showErrorMessage(NO_CONNECTION)
    return
  }
  const { step, connection } = source
  const { dialect } = source.engine
  const panel = context.panels.show(uri)
  // The connection shows above the rows at once: the view keeps its place while the session opens.
  panel.showConnection(connection, context.policy())
  const tab = new ResultSet({
    id: context.createId(),
    sql: tableDataQuery(step.table, dialect),
    values: [],
    kind: TabKind.Rows,
    canServerView: true,
    canRefresh: true,
  })
  tab.setLayout(context.layouts.get(connection.id, step.table))
  tab.waitForSession()
  panel.startRun(dialect)
  panel.addTab(tab)
  try {
    await readStep(context, uri, { tab, change: {}, shouldAutoLimit: true })
  } finally {
    settleUnread(panel, tab)
  }
}

// A read that never started (the guards or the connection stopped it) leaves no tab running.
function settleUnread(panel: ResultsPanel, tab: ResultSet): void {
  if (tab.isRunning) {
    tab.fail({ message: NOT_READ, line: null, column: null })
    panel.updateTab(tab, true)
  }
}
