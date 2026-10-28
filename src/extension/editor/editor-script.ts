import * as vscode from 'vscode'

import type { PlannedStatement } from '../../core/editor/run-plan.ts'
import { runOutcomeText } from '../../core/results/outcome.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { plural } from '../../core/results/tabs.ts'
import { isReadOnlyQuery } from '../../core/sql/statement-kind.ts'
import type { ResultsPanel } from '../results/results-panel.ts'
import type { JobRequest } from './run-job.ts'
import type { RunParts } from './run-types.ts'

// What the statements of an editor run with: the jobs of the runner, what it does once a statement
// of the user ran, and the ids of the tabs.
export interface ScriptRunner {
  readonly runJob: (parts: RunParts, job: JobRequest) => Promise<boolean>
  readonly afterSuccess: (parts: RunParts, sql: string) => void
  readonly createId: () => string
}

// The statements of an editor to run, from its document.
export interface EditorStatements {
  readonly document: vscode.TextDocument
  readonly statements: readonly PlannedStatement[]
}

// Runs the statements of an editor one after the other, each into a tab of its own, until one does
// not succeed or the run is cancelled: its tab says how many statements after it did not run.
export async function runScript(
  runner: ScriptRunner,
  parts: RunParts,
  { document, statements }: EditorStatements,
): Promise<void> {
  const ran: ResultSet[] = []
  for (const [index, statement] of statements.entries()) {
    const tab = statementTab(runner, parts, statement.sql)
    ran.push(tab)
    const isDone = await runner.runJob(parts, {
      sql: statement.sql,
      values: [],
      place: { document, offset: statement.offset, prefixLength: 0 },
      isRecorded: true,
      tab,
      kind: TabKind.Rows,
      shouldAutoLimit: true,
    })
    if (isDone) {
      runner.afterSuccess(parts, statement.sql)
    }
    if (!isDone || parts.run.isCancelled) {
      notRun(parts.panel, tab, statements.length - index - 1)
      break
    }
  }
  tellOutcomes(parts, ran)
}

function statementTab(runner: ScriptRunner, parts: RunParts, sql: string): ResultSet {
  const tab = new ResultSet({
    values: [],
    id: runner.createId(),
    sql,
    kind: TabKind.Rows,
    canServerView: isReadOnlyQuery(sql, parts.target.engine.dialect.lexical),
    canRefresh: false,
  })
  parts.panel.addTab(tab)
  return tab
}

function notRun(panel: ResultsPanel, tab: ResultSet, remaining: number): void {
  if (remaining > 0) {
    tab.addNotice(`${plural(remaining, 'statement', 'statements')} after this one did not run.`)
    panel.updateTab(tab, true)
  }
}

// The statements of a run whose panel stayed closed had only outcomes to tell: a notification tells
// them (the history keeps them too).
function tellOutcomes(parts: RunParts, tabs: readonly ResultSet[]): void {
  if (!parts.panel.isOpen) {
    const shown = tabs.map((tab) => tab.toTab())
    void vscode.window.showInformationMessage(
      runOutcomeText(shown, parts.target.engine.dialect.lexical),
    )
  }
}
