import {
  type JsonRecord,
  readBoolean,
  readCount,
  readList,
  readNested,
  readNullable,
  readNumber,
  readOneOf,
  readRecord,
  readString,
  readStrings,
} from '../json/record.ts'
import { readCells, readCellValue, readColumns, readCounts, readViewSpec } from './parse-common.ts'
import { readEditing } from './parse-editing.ts'
import {
  type HostMessage,
  HostMessageType,
  type PanelConnection,
  type ResultTab,
  type TabError,
  TabKind,
  TabStatus,
  type TabSummary,
  type WireRow,
} from './protocol.ts'

type Reader = (message: JsonRecord) => HostMessage

const TAB_STATUSES: ReadonlySet<string> = new Set(Object.values(TabStatus))
const TAB_KINDS: ReadonlySet<string> = new Set(Object.values(TabKind))

const READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
  [HostMessageType.Tabs, readTabs],
  [
    HostMessageType.Tab,
    (message) => ({ type: HostMessageType.Tab, tab: readTab(readNested(message, 'tab')) }),
  ],
  [HostMessageType.Rows, readRows],
  [HostMessageType.Cell, readCell],
  [HostMessageType.Connection, readConnectionMessage],
])

function isTabStatus(value: unknown): value is TabStatus {
  return typeof value === 'string' && TAB_STATUSES.has(value)
}

function isTabKind(value: unknown): value is TabKind {
  return typeof value === 'string' && TAB_KINDS.has(value)
}

// What the extension host sent, checked field by field: a TypeError names the first field that is
// wrong.
export function parseHostMessage(data: unknown): HostMessage {
  const message = readRecord(data)
  const read = READERS.get(readString(message, 'type'))
  if (read === undefined) {
    throw new TypeError('"type" must be a known value')
  }
  return read(message)
}

function readTabs(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.Tabs,
    tabs: readList(message, 'tabs', readTab),
    activeTabId: readNullable(message, 'activeTabId', readString),
  }
}

function readTab(tab: JsonRecord): ResultTab {
  return {
    id: readString(tab, 'id'),
    title: readString(tab, 'title'),
    sql: readString(tab, 'sql'),
    kind: readOneOf(tab, 'kind', isTabKind),
    status: readOneOf(tab, 'status', isTabStatus),
    columns: readColumns(tab, 'columns'),
    rowCount: readCount(tab, 'rowCount'),
    loadedRows: readCount(tab, 'loadedRows'),
    view: readViewSpec(tab, 'view'),
    viewVersion: readCount(tab, 'viewVersion'),
    isServerView: readBoolean(tab, 'isServerView'),
    canServerView: readBoolean(tab, 'canServerView'),
    summary: readNullable(tab, 'summary', (record, key) => readSummary(readNested(record, key))),
    error: readNullable(tab, 'error', (record, key) => readError(readNested(record, key))),
    notice: readString(tab, 'notice'),
    plan: readStrings(tab, 'plan'),
    editing: readEditing(readNested(tab, 'editing')),
  }
}

function readSummary(summary: JsonRecord): TabSummary {
  return {
    durationMs: readNumber(summary, 'durationMs'),
    affectedRows: readNullable(summary, 'affectedRows', readCount),
    isTruncated: readBoolean(summary, 'isTruncated'),
    autoLimit: readNullable(summary, 'autoLimit', readCount),
  }
}

function readError(error: JsonRecord): TabError {
  return {
    message: readString(error, 'message'),
    line: readNullable(error, 'line', readCount),
    column: readNullable(error, 'column', readCount),
  }
}

function readRows(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.Rows,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    start: readCount(message, 'start'),
    rows: readList(message, 'rows', readWireRow),
  }
}

function readWireRow(row: JsonRecord): WireRow {
  return { cells: readCells(row, 'cells'), truncated: readCounts(row, 'truncated') }
}

function readCell(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.Cell,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    row: readCount(message, 'row'),
    column: readCount(message, 'column'),
    value: readCellValue(message, 'value'),
  }
}

function readConnectionMessage(message: JsonRecord): HostMessage {
  return {
    type: HostMessageType.Connection,
    connection: readConnection(readNested(message, 'connection')),
  }
}

function readConnection(connection: JsonRecord): PanelConnection {
  return {
    name: readString(connection, 'name'),
    environment: readString(connection, 'environment'),
    isProduction: readBoolean(connection, 'isProduction'),
    isReadOnly: readBoolean(connection, 'isReadOnly'),
  }
}
