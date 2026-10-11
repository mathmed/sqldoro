import {
  type JsonRecord,
  readBoolean,
  readCount,
  readNested,
  readRecord,
  readString,
} from '../json/record.ts'
import { type SearchHostMessage, SearchHostMessageType } from './protocol.ts'
import type { SearchStatus } from './status.ts'

type Reader = (message: JsonRecord) => SearchHostMessage

const READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
  [
    SearchHostMessageType.Status,
    (message) => ({
      type: SearchHostMessageType.Status,
      status: readStatus(readNested(message, 'status')),
    }),
  ],
  [
    SearchHostMessageType.SetText,
    (message) => ({ type: SearchHostMessageType.SetText, text: readString(message, 'text') }),
  ],
  [SearchHostMessageType.Focus, () => ({ type: SearchHostMessageType.Focus })],
])

// What the extension host sent the search box, checked field by field: a TypeError names the first
// field that is wrong.
export function parseSearchHostMessage(data: unknown): SearchHostMessage {
  const message = readRecord(data)
  const read = READERS.get(readString(message, 'type'))
  if (read === undefined) {
    throw new TypeError('"type" must be a known value')
  }
  return read(message)
}

function readStatus(status: JsonRecord): SearchStatus {
  return {
    text: readString(status, 'text'),
    matchCount: readCount(status, 'matchCount'),
    connectionCount: readCount(status, 'connectionCount'),
    isLoading: readBoolean(status, 'isLoading'),
  }
}
