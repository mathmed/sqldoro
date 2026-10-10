import type { Token } from '../sql/tokens.ts'
import { unfilteredWrites } from './filters.ts'
import type { StatementCategory, StatementClass } from './statement-class.ts'
import { leadingWord, type StatementView } from './statement-view.ts'

// What every part of the classifier needs: the functions with side effects of the dialect (in upper
// case), and the classifier itself for the statements EXPLAIN ANALYZE runs.
export interface ClassifierContext {
  readonly sideEffectFunctions: ReadonlySet<string>
  readonly classify: (tokens: readonly Token[]) => StatementClass
}

export type Classifier = (view: StatementView, context: ClassifierContext) => StatementClass

// The class of a statement, with the UPDATE and DELETE statements in it that reach every row.
export function classOf(
  view: StatementView,
  category: StatementCategory,
  details: { readonly verb?: string; readonly detail?: string } = {},
): StatementClass {
  return {
    category,
    verb: details.verb ?? leadingWord(view),
    detail: details.detail ?? '',
    unfiltered: unfilteredWrites(view),
  }
}
