import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { Logger } from '../../core/platform.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { tableDataQuery } from '../../core/results/table-data.ts'
import { CommandId } from '../command-id.ts'
import { registerAll } from '../commands/command-context.ts'
import type { QueryRunner } from '../editor/query-runner.ts'
import { refreshTab } from '../editor/refresh-rows.ts'
import type { ResultsPanel } from '../results/results-panel.ts'
import type { ResultsPanels } from '../results/results-panels.ts'
import { isObjectNode } from '../tree/explorer-node.ts'
import { type TableTarget, tableUri } from './table-uri.ts'

export interface TableDataContext {
  readonly runner: QueryRunner
  readonly panels: ResultsPanels
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly engines: EngineRegistry
  readonly createId: () => string
  readonly log: Logger
}

interface Opening {
  readonly uri: vscode.Uri
  readonly target: TableTarget
  readonly connection: ConnectionConfig
}

const NOT_A_TABLE = 'Open Table Data works on a table or a view of the Connections view.'
const NOT_READ = 'sqldoro did not read the rows of this table: Refresh reads them.'

export function registerTableDataCommands(context: TableDataContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.OpenTableData, action: 'Open Table Data', run: openTableData },
  ])
}

// From a table or view of the explorer: its rows in a panel of their own, read like any query (the
// guards, the automatic limit, the editing of the rows). A table already open is shown again, not
// read again: its panel reads it again on Refresh.
async function openTableData(context: TableDataContext, argument: unknown): Promise<void> {
  if (!isObjectNode(argument) || argument.place === undefined) {
    void vscode.window.showInformationMessage(NOT_A_TABLE)
    return
  }
  const target = { connectionId: argument.connectionId, table: argument.place }
  const uri = tableUri(target)
  const open = context.panels.get(uri)
  if (open !== undefined) {
    open.reveal()
    return
  }
  const connection = context.connections(target.connectionId)
  if (connection === undefined) {
    void vscode.window.showErrorMessage('The connection of this table no longer exists.')
    return
  }
  await readTable(context, { uri, target, connection })
}

// The panel and its tab exist at once (a second click finds them), and show what stopped the read
// if it could not run.
async function readTable(context: TableDataContext, opening: Opening): Promise<void> {
  const { dialect } = context.engines.get(opening.connection.engine)
  const panel = context.panels.show(opening.uri)
  const tab = new ResultSet({
    id: context.createId(),
    sql: tableDataQuery(opening.target.table, dialect),
    kind: TabKind.Rows,
    canServerView: true,
    canRefresh: true,
  })
  panel.startRun(dialect)
  panel.addTab(tab)
  try {
    await refreshTab(context.runner, opening.uri, tab)
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
