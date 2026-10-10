import type { Dialect } from '../engine/dialect.ts'
import type { QueryResult } from '../engine/query.ts'
import { cellText } from './cells.ts'

const LINE_BREAK = /\r\n|\r|\n/

export function explainStatement(
  statement: string,
  dialect: Pick<Dialect, 'explainAnalyzePrefix' | 'explainPrefix'>,
  isAnalyze: boolean,
): string {
  return `${isAnalyze ? dialect.explainAnalyzePrefix : dialect.explainPrefix} ${statement}`
}

// The lines of a plan: PostgreSQL sends one row per line, MySQL's tree format one cell with all of
// them.
export function planLines(result: Pick<QueryResult, 'rows'>): string[] {
  return result.rows.flatMap((row) => row.map(cellText).join(' ').split(LINE_BREAK))
}
