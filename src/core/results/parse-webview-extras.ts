// The readers of the messages of the result view that navigate, lay the columns out and ask the
// host for what only it can do.
import { type JsonRecord, readBoolean, readCount, readString } from '../json/record.ts'
import { readLayout } from './parse-host-extras.ts'
import type { NavigationStart } from './protocol-parts.ts'
import { MAX_QUERY_HEIGHT, type WebviewMessage, WebviewMessageType } from './protocol.ts'

type Reader = (message: JsonRecord) => WebviewMessage

function readStart(message: JsonRecord): NavigationStart {
  return {
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    row: readCount(message, 'row'),
    isInPlace: readBoolean(message, 'isInPlace'),
  }
}

function readSetLayout(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.SetLayout,
    tabId: readString(message, 'tabId'),
    layout: readLayout(message, 'layout'),
  }
}

function readNavigate(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.Navigate,
    ...readStart(message),
    column: readCount(message, 'column'),
  }
}

function readOpenReference(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.OpenReference,
    ...readStart(message),
    reference: readCount(message, 'reference'),
  }
}

function readCountReferences(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.CountReferences,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    row: readCount(message, 'row'),
  }
}

function readPeek(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.Peek,
    tabId: readString(message, 'tabId'),
    viewVersion: readCount(message, 'viewVersion'),
    row: readCount(message, 'row'),
    column: readCount(message, 'column'),
  }
}

function readGoToStep(message: JsonRecord): WebviewMessage {
  return { type: WebviewMessageType.GoToStep, step: readCount(message, 'step') }
}

function readAllowWrites(): WebviewMessage {
  return { type: WebviewMessageType.AllowWrites }
}

function readOpenInEditor(message: JsonRecord): WebviewMessage {
  return { type: WebviewMessageType.OpenInEditor, tabId: readString(message, 'tabId') }
}

function readFetchDistinct(message: JsonRecord): WebviewMessage {
  return {
    type: WebviewMessageType.FetchDistinct,
    tabId: readString(message, 'tabId'),
    column: readCount(message, 'column'),
  }
}

function readRunQuery(message: JsonRecord): WebviewMessage {
  return { type: WebviewMessageType.RunQuery, sql: readString(message, 'sql') }
}

function readOpenSqlInEditor(message: JsonRecord): WebviewMessage {
  return { type: WebviewMessageType.OpenSqlInEditor, sql: readString(message, 'sql') }
}

function readSetQueryHeight(message: JsonRecord): WebviewMessage {
  const height = readCount(message, 'height')
  if (height > MAX_QUERY_HEIGHT) {
    throw new TypeError(`"height" must be at most ${String(MAX_QUERY_HEIGHT)}`)
  }
  return { type: WebviewMessageType.SetQueryHeight, height }
}

export const WEBVIEW_EXTRA_READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
  [WebviewMessageType.SetLayout, readSetLayout],
  [WebviewMessageType.Navigate, readNavigate],
  [WebviewMessageType.OpenReference, readOpenReference],
  [WebviewMessageType.CountReferences, readCountReferences],
  [WebviewMessageType.Peek, readPeek],
  [WebviewMessageType.GoToStep, readGoToStep],
  [WebviewMessageType.AllowWrites, readAllowWrites],
  [WebviewMessageType.OpenInEditor, readOpenInEditor],
  [WebviewMessageType.FetchDistinct, readFetchDistinct],
  [WebviewMessageType.RunQuery, readRunQuery],
  [WebviewMessageType.OpenSqlInEditor, readOpenSqlInEditor],
  [WebviewMessageType.SetQueryHeight, readSetQueryHeight],
])
