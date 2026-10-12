import { type JsonRecord, readRecord, readString } from '../json/record.ts'
import { type SearchViewMessage, SearchViewMessageType } from './protocol.ts'

type Reader = (message: JsonRecord) => SearchViewMessage

const READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
  [SearchViewMessageType.Ready, () => ({ type: SearchViewMessageType.Ready })],
  [
    SearchViewMessageType.Search,
    (message) => ({ type: SearchViewMessageType.Search, text: readString(message, 'text') }),
  ],
  [SearchViewMessageType.Focused, () => ({ type: SearchViewMessageType.Focused })],
  [SearchViewMessageType.OpenBest, () => ({ type: SearchViewMessageType.OpenBest })],
  [SearchViewMessageType.FocusTree, () => ({ type: SearchViewMessageType.FocusTree })],
  [
    SearchViewMessageType.Problem,
    (message) => ({
      type: SearchViewMessageType.Problem,
      message: readString(message, 'message'),
    }),
  ],
])

// What the search box sent, checked field by field: a TypeError names the first field that is
// wrong, never a value.
export function parseSearchViewMessage(data: unknown): SearchViewMessage {
  const message = readRecord(data)
  const read = READERS.get(readString(message, 'type'))
  if (read === undefined) {
    throw new TypeError('"type" must be a known value')
  }
  return read(message)
}
