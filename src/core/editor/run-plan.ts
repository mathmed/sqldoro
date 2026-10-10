import type { LexicalRules } from '../sql/lexical-rules.ts'
import { splitStatements, statementAt } from '../sql/statements.ts'

// Run the selection or the statement under the cursor, or the whole script.
export const RunScope = {
  Current: 'current',
  All: 'all',
} as const

export type RunScope = (typeof RunScope)[keyof typeof RunScope]

export interface RunSource {
  readonly text: string
  readonly selectionStart: number
  readonly selectionEnd: number
  readonly cursor: number
}

// A statement to run, and where it starts in the document (to place the errors it gets).
export interface PlannedStatement {
  readonly sql: string
  readonly offset: number
}

// A selection runs each of its statements; with no selection, the statement under the cursor.
export function planRun(
  source: RunSource,
  scope: RunScope,
  rules: LexicalRules,
): PlannedStatement[] {
  if (scope === RunScope.All) {
    return statementsOf(source.text, 0, rules)
  }
  if (source.selectionStart !== source.selectionEnd) {
    const selected = source.text.slice(source.selectionStart, source.selectionEnd)
    return statementsOf(selected, source.selectionStart, rules)
  }
  const statement = statementAt(splitStatements(source.text, rules), source.cursor, source.text)
  return statement === undefined ? [] : [{ sql: statement.text, offset: statement.start }]
}

function statementsOf(text: string, offset: number, rules: LexicalRules): PlannedStatement[] {
  return splitStatements(text, rules).map((statement) => ({
    sql: statement.text,
    offset: offset + statement.start,
  }))
}
