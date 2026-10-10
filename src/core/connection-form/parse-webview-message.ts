import { isPathField } from '../connection/transitions.ts'
import { type JsonRecord, readOneOf, readRecord, readString } from '../json/record.ts'
import { readSubmittedDraft } from './parse-common.ts'
import { type FormViewMessage, FormViewMessageType } from './protocol.ts'

type Reader = (message: JsonRecord) => FormViewMessage

const READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
  [FormViewMessageType.Ready, () => ({ type: FormViewMessageType.Ready })],
  [FormViewMessageType.Cancel, () => ({ type: FormViewMessageType.Cancel })],
  [
    FormViewMessageType.Browse,
    (message) => ({
      type: FormViewMessageType.Browse,
      field: readOneOf(message, 'field', isPathField),
    }),
  ],
  [
    FormViewMessageType.Test,
    (message) => ({ type: FormViewMessageType.Test, draft: readSubmittedDraft(message, 'draft') }),
  ],
  [
    FormViewMessageType.Save,
    (message) => ({ type: FormViewMessageType.Save, draft: readSubmittedDraft(message, 'draft') }),
  ],
  [
    FormViewMessageType.Problem,
    (message) => ({ type: FormViewMessageType.Problem, message: readString(message, 'message') }),
  ],
])

// What the connection form sent, checked field by field: a TypeError names the first field that is
// wrong, never a value.
export function parseFormViewMessage(data: unknown): FormViewMessage {
  const message = readRecord(data)
  const read = READERS.get(readString(message, 'type'))
  if (read === undefined) {
    throw new TypeError('"type" must be a known value')
  }
  return read(message)
}
