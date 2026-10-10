import { readConnection } from '../connection/codec.ts'
import { isSecretKind, type SecretKind } from '../connection/secrets.ts'
import {
  type JsonRecord,
  readArray,
  readList,
  readNested,
  readOneOf,
  readString,
} from '../json/record.ts'
import type { SecretChange } from './draft.ts'
import type { SubmittedDraft } from './protocol.ts'

// Kinds of secrets, never their values: a TypeError names the position of the first one that is
// not a kind.
export function readSecretKinds(record: JsonRecord, key: string): SecretKind[] {
  return readArray(record, key).map((value, index) =>
    readOneOf(new Map([[String(index), value]]), String(index), isSecretKind),
  )
}

// The errors name the fields, never the values: they may be secrets.
export function readSubmittedDraft(record: JsonRecord, key: string): SubmittedDraft {
  const draft = readNested(record, key)
  const secretChanges = readList(draft, 'secretChanges', readSecretChange)
  if (new Set(secretChanges.map((change) => change.kind)).size !== secretChanges.length) {
    throw new TypeError('"secretChanges" must change each secret once')
  }
  return { connection: readConnection(readNested(draft, 'connection')), secretChanges }
}

function readSecretChange(change: JsonRecord): SecretChange {
  return { kind: readOneOf(change, 'kind', isSecretKind), value: readString(change, 'value') }
}
