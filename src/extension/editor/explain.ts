import * as vscode from 'vscode'

import { type PlannedStatement, planRun, RunScope } from '../../core/editor/run-plan.ts'
import { explainStatement } from '../../core/results/plan.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { isReadOnlyQuery } from '../../core/sql/statement-kind.ts'
import { sourceOf } from './editor-source.ts'
import type { QueryRunner } from './query-runner.ts'
import type { RunTarget, RunWork } from './run-types.ts'

const ANALYZE_BUTTON = 'Run EXPLAIN ANALYZE'

// EXPLAIN shows the plan of the statement under the cursor (or selected); EXPLAIN ANALYZE runs it to
// measure each step, so it asks first, and only for a query that only reads.
export async function explain(
  runner: QueryRunner,
  editor: vscode.TextEditor,
  isAnalyze: boolean,
): Promise<void> {
  if (!(await runner.confirmDropChanges(editor.document.uri))) {
    return
  }
  await runner.perform(editor.document, async (target) => {
    const statement = singleStatement(editor, target)
    if (statement === undefined || (isAnalyze && !(await confirmAnalyze(statement.sql, target)))) {
      return undefined
    }
    return explainWork(runner, { statement, target, isAnalyze })
  })
}

function singleStatement(
  editor: vscode.TextEditor,
  target: RunTarget,
): PlannedStatement | undefined {
  const statements = planRun(sourceOf(editor), RunScope.Current, target.engine.dialect.lexical)
  const [statement] = statements
  if (statement !== undefined && statements.length === 1) {
    return statement
  }
  void vscode.window.showInformationMessage(
    statement === undefined
      ? 'Put the cursor on the statement to explain, or select it.'
      : 'Select a single statement to explain.',
  )
  return undefined
}

interface ExplainSpec {
  readonly statement: PlannedStatement
  readonly target: RunTarget
  readonly isAnalyze: boolean
}

function explainWork(runner: QueryRunner, { statement, target, isAnalyze }: ExplainSpec): RunWork {
  const dialect = target.engine.dialect
  const prefixLength = explainStatement('', dialect, isAnalyze).length
  const sql = explainStatement(statement.sql, dialect, isAnalyze)
  return {
    statements: [sql],
    run: async (parts) => {
      runner.startRun(parts)
      await runner.runJob(parts, {
        sql,
        values: [],
        place: { offset: statement.offset, prefixLength },
        isRecorded: true,
        kind: TabKind.Plan,
        shouldAutoLimit: false,
      })
    },
  }
}

async function confirmAnalyze(sql: string, target: RunTarget): Promise<boolean> {
  if (!isReadOnlyQuery(sql, target.engine.dialect.lexical)) {
    void vscode.window.showWarningMessage(
      'EXPLAIN ANALYZE runs the statement: sqldoro only runs it for a query that only reads (SELECT, WITH, TABLE or VALUES).',
    )
    return false
  }
  const choice = await vscode.window.showWarningMessage(
    `EXPLAIN ANALYZE runs the query on "${target.connection.name}" to measure it.`,
    {
      modal: true,
      detail:
        'The query runs for real: it takes as long and uses the same resources as running it.',
    },
    ANALYZE_BUTTON,
  )
  return choice === ANALYZE_BUTTON
}
