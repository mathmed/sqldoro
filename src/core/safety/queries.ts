import { identifierName } from '../sql/tokens.ts'
import { type ClassifierContext, classOf } from './classifier-context.ts'
import { StatementCategory, type StatementClass } from './statement-class.ts'
import {
  hasPair,
  isOpeningAt,
  statementStarts,
  type StatementView,
  wordAt,
} from './statement-view.ts'

// Statements that change rows, found where a statement starts inside a query: WITH queries.
const NESTED_WRITES: ReadonlySet<string> = new Set(['DELETE', 'INSERT', 'MERGE', 'UPDATE'])
// FOR UPDATE, FOR NO KEY UPDATE, FOR SHARE, FOR KEY SHARE (and MySQL's LOCK IN SHARE MODE).
const LOCKING_AFTER_FOR: ReadonlySet<string> = new Set(['KEY', 'NO', 'SHARE', 'UPDATE'])
const LOCKING_AFTER_LOCK: ReadonlySet<string> = new Set(['IN'])

type Finder = (view: StatementView, context: ClassifierContext) => StatementClass | undefined

// What makes a query more than a read, in the order they are looked for.
const FINDERS: readonly Finder[] = [nestedWrite, selectInto, lockingRead, sideEffectCall]

// A query (SELECT, WITH, TABLE, VALUES, COPY ... TO STDOUT) reads, unless something in it writes.
export function classifyQuery(view: StatementView, context: ClassifierContext): StatementClass {
  for (const find of FINDERS) {
    const write = find(view, context)
    if (write !== undefined) {
      return write
    }
  }
  return classOf(view, StatementCategory.Read)
}

function nestedWrite(view: StatementView): StatementClass | undefined {
  const verb = statementStarts(view)
    .map((start) => wordAt(view, start.index))
    .find((word) => NESTED_WRITES.has(word))
  return verb === undefined ? undefined : classOf(view, StatementCategory.Write, { verb })
}

// SELECT ... INTO creates a table (PostgreSQL), or writes a file or variables (MySQL).
function selectInto(view: StatementView): StatementClass | undefined {
  return view.tokens.some((...[, index]) => wordAt(view, index) === 'INTO')
    ? classOf(view, StatementCategory.Write, { detail: 'it writes what it reads, with INTO' })
    : undefined
}

function lockingRead(view: StatementView): StatementClass | undefined {
  const isLocking =
    hasPair(view, 'FOR', LOCKING_AFTER_FOR) || hasPair(view, 'LOCK', LOCKING_AFTER_LOCK)
  return isLocking
    ? classOf(view, StatementCategory.Write, { detail: 'it locks the rows it reads' })
    : undefined
}

function sideEffectCall(
  view: StatementView,
  context: ClassifierContext,
): StatementClass | undefined {
  const called = view.tokens
    .filter((...[, index]) => isOpeningAt(view, index + 1))
    .map(identifierName)
    .find((name) => context.sideEffectFunctions.has(name.toUpperCase()))
  return called === undefined
    ? undefined
    : classOf(view, StatementCategory.Write, { detail: `it calls ${called}` })
}
