import type { Dialect } from '../engine/dialect.ts'
import { keywordOf } from '../sql/statement-kind.ts'
import type { Token } from '../sql/tokens.ts'
import { type Classifier, type ClassifierContext, classOf } from './classifier-context.ts'
import { classifyExplain } from './explain.ts'
import { classifyQuery } from './queries.ts'
import { mergeClasses, StatementCategory, type StatementClass } from './statement-class.ts'
import {
  codeTokens,
  hasPair,
  leadingIndex,
  leadingWord,
  statementsOf,
  type StatementView,
  viewOf,
  wordAt,
} from './statement-view.ts'

export type ClassifierDialect = Pick<Dialect, 'lexical' | 'sideEffectFunctions'>

const { Read, Write, Ddl, Transaction, Session, Unknown } = StatementCategory

// Statements whose first word says what they do.
const BY_FIRST_WORD: ReadonlyMap<string, StatementCategory> = new Map([
  ['ALTER', Ddl],
  ['ANALYZE', Session],
  ['BINLOG', Session],
  ['CACHE', Session],
  ['CALL', Write],
  ['CHANGE', Session],
  ['CHECK', Session],
  ['CHECKPOINT', Session],
  ['CHECKSUM', Read],
  ['CLONE', Session],
  ['CLOSE', Session],
  ['CLUSTER', Session],
  ['COMMENT', Ddl],
  ['CREATE', Ddl],
  ['DEALLOCATE', Session],
  ['DECLARE', Session],
  ['DELETE', Write],
  ['DISCARD', Session],
  ['DO', Write],
  ['DROP', Ddl],
  ['FETCH', Session],
  ['FLUSH', Session],
  ['GET', Session],
  ['GRANT', Ddl],
  ['HANDLER', Session],
  ['HELP', Read],
  ['IMPORT', Ddl],
  ['INSERT', Write],
  ['INSTALL', Session],
  ['KILL', Session],
  ['LISTEN', Session],
  ['LOCK', Session],
  ['MERGE', Write],
  ['MOVE', Session],
  ['NOTIFY', Session],
  ['OPTIMIZE', Session],
  ['PREPARE', Session],
  ['PURGE', Session],
  ['REASSIGN', Ddl],
  ['REFRESH', Ddl],
  ['REINDEX', Session],
  ['RENAME', Ddl],
  ['REPAIR', Session],
  ['REPLACE', Write],
  ['RESET', Session],
  ['RESIGNAL', Session],
  ['RESTART', Session],
  ['REVOKE', Ddl],
  ['SECURITY', Ddl],
  ['SET', Session],
  ['SHOW', Read],
  ['SHUTDOWN', Session],
  ['SIGNAL', Session],
  ['STOP', Session],
  ['TRUNCATE', Ddl],
  ['UNINSTALL', Session],
  ['UNLISTEN', Session],
  ['UNLOCK', Session],
  ['UPDATE', Write],
  ['UPSERT', Write],
  ['USE', Session],
  ['VACUUM', Session],
  ['XA', Session],
])

// Statements whose first word is not enough.
const CLASSIFIERS: ReadonlyMap<string, Classifier> = new Map<string, Classifier>([
  ['ABORT', classifyTransaction],
  ['BEGIN', classifyTransaction],
  ['COMMIT', classifyTransaction],
  ['COPY', classifyCopy],
  ['DESC', classifyExplain],
  ['DESCRIBE', classifyExplain],
  ['END', classifyTransaction],
  ['EXPLAIN', classifyExplain],
  ['LOAD', classifyLoad],
  ['RELEASE', classifyTransaction],
  ['ROLLBACK', classifyTransaction],
  ['SAVEPOINT', classifyTransaction],
  ['SELECT', classifyQuery],
  ['START', classifyTransaction],
  ['TABLE', classifyQuery],
  ['VALUES', classifyQuery],
  ['WITH', classifyQuery],
])

const READ_WRITE: ReadonlySet<string> = new Set(['WRITE'])
const TO_STDOUT: ReadonlySet<string> = new Set(['STDOUT'])
const LOADED_ROWS: ReadonlySet<string> = new Set(['DATA', 'XML'])

// What each statement of a script does. Fails closed: whatever sqldoro cannot read or does not know
// is Unknown, which the guards treat as a write.
export function classifyScript(sql: string, dialect: ClassifierDialect): StatementClass[] {
  const tokens = codeTokens(sql, dialect.lexical)
  if (tokens === undefined) {
    return [unknown('a string, quoted name or comment in it is not closed')]
  }
  const context = contextOf(dialect)
  return statementsOf(tokens).map(context.classify)
}

// What a statement does; a text with several statements is as dangerous as its worst one.
export function classifyStatement(sql: string, dialect: ClassifierDialect): StatementClass {
  return mergeClasses(classifyScript(sql, dialect))
}

function contextOf(dialect: ClassifierDialect): ClassifierContext {
  const context: ClassifierContext = {
    sideEffectFunctions: new Set(dialect.sideEffectFunctions.map((name) => name.toUpperCase())),
    classify: (tokens) => classifyTokens(tokens, context),
  }
  return context
}

function classifyTokens(tokens: readonly Token[], context: ClassifierContext): StatementClass {
  const view = viewOf(tokens)
  if (view === undefined) {
    return unknown('its parentheses do not match')
  }
  const word = leadingWord(view)
  const classify = CLASSIFIERS.get(word) ?? classifyByFirstWord
  return classify(view, context)
}

function classifyByFirstWord(view: StatementView): StatementClass {
  const category = BY_FIRST_WORD.get(leadingWord(view))
  return category === undefined
    ? classOf(view, Unknown, { detail: 'sqldoro cannot tell what it does' })
    : classOf(view, category)
}

// BEGIN, START TRANSACTION, COMMIT, ROLLBACK, SAVEPOINT... unless they let the transaction write
// (READ WRITE), settle a prepared transaction or start something else (START REPLICA): those change
// the session.
function classifyTransaction(view: StatementView): StatementClass {
  if (isSessionControl(view)) {
    return classOf(view, Session)
  }
  return hasPair(view, 'READ', READ_WRITE)
    ? classOf(view, Session, { detail: 'it lets the transaction write' })
    : classOf(view, Transaction)
}

function isSessionControl(view: StatementView): boolean {
  const isStartOfOther =
    leadingWord(view) === 'START' && wordAt(view, leadingIndex(view) + 1) !== 'TRANSACTION'
  return isStartOfOther || view.tokens.some((token) => keywordOf(token) === 'PREPARED')
}

// COPY ... TO STDOUT reads; any other COPY writes a table or a file.
function classifyCopy(view: StatementView, context: ClassifierContext): StatementClass {
  return hasPair(view, 'TO', TO_STDOUT) ? classifyQuery(view, context) : classOf(view, Write)
}

// LOAD DATA and LOAD XML write rows; other LOAD statements load a library or an index.
function classifyLoad(view: StatementView): StatementClass {
  return LOADED_ROWS.has(wordAt(view, leadingIndex(view) + 1))
    ? classOf(view, Write)
    : classOf(view, Session)
}

function unknown(detail: string): StatementClass {
  return { category: Unknown, verb: '', detail, unfiltered: [] }
}
