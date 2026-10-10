// What a statement does, as far as the safety guards are concerned.
export const StatementCategory = {
  Read: 'read',
  Write: 'write',
  Ddl: 'ddl',
  Transaction: 'transaction',
  // Session settings and administration: SET, USE, LOCK TABLES, VACUUM, KILL...
  Session: 'session',
  // What sqldoro cannot tell: treated as a write.
  Unknown: 'unknown',
} as const

export type StatementCategory = (typeof StatementCategory)[keyof typeof StatementCategory]

// An UPDATE or a DELETE that reaches every row of its table: it has no WHERE of its own, or one
// that is always true.
export interface UnfilteredWrite {
  readonly verb: string
  // The table without its quotes or schema; empty when sqldoro cannot tell.
  readonly table: string
  readonly hasAlwaysTrueWhere: boolean
}

export interface StatementClass {
  readonly category: StatementCategory
  // What the statement does in a word or a few, for messages and the log: UPDATE, EXPLAIN ANALYZE
  // DELETE. Empty when it does not start with a word.
  readonly verb: string
  // Why the statement is not what its first word suggests (a SELECT that calls nextval), or why
  // sqldoro cannot tell what it does; empty otherwise.
  readonly detail: string
  readonly unfiltered: readonly UnfilteredWrite[]
}

// From the least to the most dangerous: a text with several statements is as dangerous as its worst.
const SEVERITY: readonly StatementCategory[] = [
  StatementCategory.Read,
  StatementCategory.Transaction,
  StatementCategory.Session,
  StatementCategory.Write,
  StatementCategory.Ddl,
  StatementCategory.Unknown,
]

const NO_STATEMENT: StatementClass = {
  category: StatementCategory.Unknown,
  verb: '',
  detail: 'there is no statement in it',
  unfiltered: [],
}

// Statements that read, and transaction control, change nothing by themselves: they are what a
// read-only connection runs.
export function isHarmless(statement: Pick<StatementClass, 'category'>): boolean {
  return (
    statement.category === StatementCategory.Read ||
    statement.category === StatementCategory.Transaction
  )
}

// The class of a text that holds several statements: the most dangerous one, with every UPDATE and
// DELETE that reaches all rows.
export function mergeClasses(classes: readonly StatementClass[]): StatementClass {
  const [worst] = [...classes].sort((first, second) => severity(second) - severity(first))
  if (worst === undefined) {
    return NO_STATEMENT
  }
  return { ...worst, unfiltered: classes.flatMap((statement) => statement.unfiltered) }
}

function severity(statement: StatementClass): number {
  return SEVERITY.indexOf(statement.category)
}

// "UPDATE", "SELECT (it calls nextval)", or "statement" when it starts with no word.
export function describeStatement(statement: Pick<StatementClass, 'detail' | 'verb'>): string {
  const verb = statement.verb === '' ? 'statement' : statement.verb
  return statement.detail === '' ? verb : `${verb} (${statement.detail})`
}
