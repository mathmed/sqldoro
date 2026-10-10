import { EditKind } from '../edits/edit-kind.ts'
import {
  type JsonRecord,
  readBoolean,
  readCount,
  readNested,
  readNullable,
  readOneOf,
  readRecord,
  readString,
} from '../json/record.ts'
import { isExportFormat } from './export-format.ts'
import { readRange, readViewSpec } from './parse-common.ts'
import { MAX_WINDOW_ROWS, type WebviewMessage, WebviewMessageType } from './protocol.ts'

type Reader = (message: JsonRecord) => WebviewMessage

const READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
  [WebviewMessageType.Ready, () => ({ type: WebviewMessageType.Ready })],
  [WebviewMessageType.Cancel, () => ({ type: WebviewMessageType.Cancel })],
  [WebviewMessageType.FetchRows, readFetchRows],
  [WebviewMessageType.SetView, readSetView],
  [WebviewMessageType.Copy, readCopy],
  [WebviewMessageType.Export, readExport],
  [WebviewMessageType.FetchCell, readFetchCell],
  [WebviewMessageType.LoadAll, readLoadAll],
  [
    WebviewMessageType.Refresh,
    (message) => ({ type: WebviewMessageType.Refresh, tabId: readString(message, 'tabId') }),
  ],
  [WebviewMessageType.Problem, readProblem],
  [WebviewMessageType.Edit, readEdit],
  [
    WebviewMessageType.PreviewEdits,
    (message) => ({ type: WebviewMessageType.PreviewEdits, tabId: readString(message, 'tabId') }),
  ],
  [
    WebviewMessageType.ClosePreview,
    (message) => ({ type: WebviewMessageType.ClosePreview, tabId: readString(message, 'tabId') }),
  ],
  [WebviewMessageType.ApplyEdits, readApplyEdits],
])
const EDIT_KINDS: ReadonlySet<string> = new Set(Object.values(EditKind))

function isEditKind(value: unknown): value is EditKind {
  return typeof value === 'string' && EDIT_KINDS.has(value)
}

// What the webview sent, checked field by field: a TypeError names the first field that is wrong.
export function parseWebviewMessage(data: unknown): WebviewMessage {
  const message = readRecord(data)
  const read = READERS.get(readString(message, 'type'))
  if (read === undefined) {
    throw new TypeError('"type" must be a known value')
  }
  return read(message)
}

function readFetchRows(message: JsonRecord): WebviewMessage {
  const count = readCount(message, 'count')
  if (count > MAX_WINDOW_ROWS) {
    throw new TypeError(`"count" must be at most ${String(MAX_WINDOW_ROWS)}`)
  }
  return {
    type: WebviewMessageType.FetchRows,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    start: readCount(message, 'start'),
    count,
  }
}

function readSetView(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.SetView,
    tabId: readString(message, 'tabId'),
    view: readViewSpec(message, 'view'),
    isServerSide: readBoolean(message, 'isServerSide'),
  }
}

function readCopy(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.Copy,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    range: readRange(message, 'range'),
    format: readOneOf(message, 'format', isExportFormat),
  }
}

function readExport(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.Export,
    tabId: readString(message, 'tabId'),
    format: readOneOf(message, 'format', isExportFormat),
  }
}

function readFetchCell(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.FetchCell,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    row: readCount(message, 'row'),
    column: readCount(message, 'column'),
  }
}

function readLoadAll(message: JsonRecord): WebviewMessage {
  return { type: WebviewMessageType.LoadAll, tabId: readString(message, 'tabId') }
}

function readProblem(message: JsonRecord): WebviewMessage {
  return { type: WebviewMessageType.Problem, message: readString(message, 'message') }
}

function readEdit(message: JsonRecord): WebviewMessage {
  const edit = readNested(message, 'edit')
  return {
    type: WebviewMessageType.Edit,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    edit: {
      kind: readOneOf(edit, 'kind', isEditKind),
      range: readNullable(edit, 'range', readRange),
      input: readString(edit, 'input'),
    },
  }
}

function readApplyEdits(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.ApplyEdits,
    tabId: readString(message, 'tabId'),
    previewId: readCount(message, 'previewId'),
  }
}
