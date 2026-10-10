import { keywordOf } from '../sql/statement-kind.ts'
import type { ClassifierContext } from './classifier-context.ts'
import { StatementCategory, type StatementClass } from './statement-class.ts'
import { leadingIndex, leadingWord, type StatementView, wordAt } from './statement-view.ts'

// The statements EXPLAIN shows the plan of.
const EXPLAINED: ReadonlySet<string> = new Set([
  'CREATE',
  'DECLARE',
  'DELETE',
  'EXECUTE',
  'INSERT',
  'MERGE',
  'REPLACE',
  'SELECT',
  'TABLE',
  'UPDATE',
  'VALUES',
  'WITH',
])
const ANALYZE: ReadonlySet<string> = new Set(['ANALYSE', 'ANALYZE'])

// EXPLAIN only plans its statement, unless ANALYZE runs it: then it does what the statement does.
// DESCRIBE (or EXPLAIN) of a table only reads.
export function classifyExplain(view: StatementView, context: ClassifierContext): StatementClass {
  const verb = leadingWord(view)
  const start = explainedStart(view)
  const options = view.tokens.slice(0, start === -1 ? undefined : start)
  if (!options.some((token) => ANALYZE.has(keywordOf(token)))) {
    return { category: StatementCategory.Read, verb, detail: '', unfiltered: [] }
  }
  if (start === -1) {
    return {
      category: StatementCategory.Unknown,
      verb: `${verb} ANALYZE`,
      detail: 'sqldoro cannot tell what it runs',
      unfiltered: [],
    }
  }
  const explained = context.classify(view.tokens.slice(start))
  return { ...explained, verb: `${verb} ANALYZE ${explained.verb}` }
}

// The leading word is inside as many parentheses as come before it.
function explainedStart(view: StatementView): number {
  const depth = leadingIndex(view)
  return view.depths.findIndex((at, index) => at === depth && EXPLAINED.has(wordAt(view, index)))
}
