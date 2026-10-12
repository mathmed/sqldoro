// The readers of the messages the host sends beside the tabs: the trail of a table panel, the peek
// of a referenced row, the counts of referencing rows, the values of a column, and the SQL of the
// connection.
import type { ColumnLayout } from '../grid/column-layout.ts'
import {
  type JsonRecord,
  readArray,
  readBoolean,
  readCount,
  readList,
  readNested,
  readNullable,
  readString,
  readStrings,
} from '../json/record.ts'
import type { Crumb } from '../navigation/history.ts'
import type { LexicalRules } from '../sql/lexical-rules.ts'
import { readCells } from './parse-common.ts'
import type { QueryBoxText } from './protocol-parts.ts'
import { type HostMessage, HostMessageType } from './protocol.ts'
import type { ColumnMeta, PeekView, RowReference } from './tab-meta.ts'

export function readColumnMeta(meta: JsonRecord): ColumnMeta {
  return { choices: readStrings(meta, 'choices'), reference: readString(meta, 'reference') }
}

export function readRowReference(reference: JsonRecord): RowReference {
  return { label: readString(reference, 'label') }
}

export function readLayout(record: JsonRecord, key: string): ColumnLayout {
  const layout = readNested(record, key)
  return { order: readStrings(layout, 'order'), hidden: readStrings(layout, 'hidden') }
}

export function readTrail(message: JsonRecord): HostMessage {
  return { type: HostMessageType.Trail, crumbs: readList(message, 'crumbs', readCrumb) }
}

function readCrumb(crumb: JsonRecord): Crumb {
  return {
    id: readCount(crumb, 'id'),
    label: readString(crumb, 'label'),
    isCurrent: readBoolean(crumb, 'isCurrent'),
    isQuery: readBoolean(crumb, 'isQuery'),
  }
}

export function readPeek(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.Peek,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    row: readCount(message, 'row'),
    column: readCount(message, 'column'),
    peek: readPeekView(readNested(message, 'peek')),
  }
}

function readPeekView(peek: JsonRecord): PeekView {
  return {
    title: readString(peek, 'title'),
    columns: readStrings(peek, 'columns'),
    values: readCells(peek, 'values'),
    problem: readString(peek, 'problem'),
  }
}

export function readReferenceCounts(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.ReferenceCounts,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    row: readCount(message, 'row'),
    counts: readArray(message, 'counts').map((count, index) =>
      count === null ? null : readString(new Map([[String(index), count]]), String(index)),
    ),
  }
}

export function readDistinct(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.Distinct,
    tabId: readString(message, 'tabId'),
    column: readCount(message, 'column'),
    values: readStrings(message, 'values'),
    isComplete: readBoolean(message, 'isComplete'),
  }
}

export function readSql(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.Sql,
    identifierQuote: readString(message, 'identifierQuote'),
    lexical: readLexicalRules(readNested(message, 'lexical')),
    keywords: readStrings(message, 'keywords'),
  }
}

function readLexicalRules(rules: JsonRecord): LexicalRules {
  return {
    stringQuotes: readStrings(rules, 'stringQuotes'),
    identifierQuotes: readStrings(rules, 'identifierQuotes'),
    hasBackslashEscapes: readBoolean(rules, 'hasBackslashEscapes'),
    hasEscapeStrings: readBoolean(rules, 'hasEscapeStrings'),
    hasDollarQuotes: readBoolean(rules, 'hasDollarQuotes'),
    hasHashComments: readBoolean(rules, 'hasHashComments'),
    hasSpacedDashComments: readBoolean(rules, 'hasSpacedDashComments'),
    hasNestedComments: readBoolean(rules, 'hasNestedComments'),
    hasExecutableComments: readBoolean(rules, 'hasExecutableComments'),
    hasLowerCaseFolding: readBoolean(rules, 'hasLowerCaseFolding'),
  }
}

export function readQueryBoxText(record: JsonRecord, key: string): QueryBoxText {
  const box = readNested(record, key)
  return { sql: readString(box, 'sql'), isCustom: readBoolean(box, 'isCustom') }
}

export function readQueryBox(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.QueryBox,
    tables: readStrings(message, 'tables'),
    height: readNullable(message, 'height', readCount),
  }
}
