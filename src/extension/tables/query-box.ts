import * as vscode from 'vscode'

import type { ObjectRef } from '../../core/engine/catalog.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import { withQuery } from '../../core/navigation/history.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { boxQuery } from '../../core/results/query-box.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { isReadOnlyQuery } from '../../core/sql/statement-kind.ts'
import type { RunParts, RunTarget, RunWork } from '../editor/run-types.ts'
import { offerQueryBox } from './query-box-offer.ts'
import type { TableContext } from './table-context.ts'

// Runs the text of the query box of a table panel in place of its rows: one statement, through the
// guards like a statement of an SQL editor (its class, the read-only connections, the confirmations
// of production, the automatic limit), kept in the query history. Once the guards let it run, it
// becomes a step of the trail of the panel (Back returns to the rows it was run from) and its
// result replaces the rows; nothing changes when they refuse it.
export async function runBoxQuery(
  context: TableContext,
  uri: vscode.Uri,
  text: string,
): Promise<void> {
  const step = context.navigations.current(uri)
  if (step === undefined || !(await context.runner.confirmDropChanges(uri))) {
    return
  }
  await context.runner.perform(uri, async (target) =>
    Promise.resolve(queryWork(context, target, { text, table: step.table })),
  )
}

interface BoxRun {
  readonly text: string
  // The table of the rows the query is run from.
  readonly table: ObjectRef
}

function queryWork(context: TableContext, target: RunTarget, run: BoxRun): RunWork | undefined {
  const query = boxQuery(run.text, target.engine.dialect.lexical)
  if ('problem' in query) {
    void vscode.window.showWarningMessage(query.problem)
    return undefined
  }
  return {
    statements: [query.sql],
    run: async (parts) => runQuery(context, parts, { ...run, text: query.sql }),
  }
}

async function runQuery(context: TableContext, parts: RunParts, run: BoxRun): Promise<void> {
  const { uri, engine } = parts.target
  const sql = run.text
  context.navigations.update(uri, (navigation) => withQuery(navigation, sql))
  const tab = queryTab(context, sql, engine.dialect)
  parts.panel.startRun(engine.dialect)
  parts.panel.addTab(tab)
  void offerQueryBox(context, parts, run.table)
  const isDone = await context.runner.runJob(parts, {
    sql,
    values: [],
    place: undefined,
    isRecorded: true,
    kind: TabKind.Rows,
    tab,
    shouldAutoLimit: true,
  })
  if (isDone) {
    context.runner.afterSuccess(parts, sql)
  }
}

// The tab of a query of the query box: its rows are sorted and filtered here (or on the server when
// it only reads), and the box shows the query with them.
export function queryTab(
  context: Pick<TableContext, 'createId'>,
  sql: string,
  dialect: Pick<Dialect, 'lexical'>,
): ResultSet {
  const tab = new ResultSet({
    id: context.createId(),
    sql,
    values: [],
    kind: TabKind.Rows,
    canServerView: isReadOnlyQuery(sql, dialect.lexical),
    canRefresh: false,
  })
  tab.showInBox({ query: sql })
  return tab
}
