import { readConnection } from '../connection/codec.ts'
import { isPathField } from '../connection/transitions.ts'
import { ConnectionField, type ValidationIssue } from '../connection/validation.ts'
import type { EngineOption } from '../engine/engine.ts'
import {
  type JsonRecord,
  readBoolean,
  readCount,
  readList,
  readNested,
  readOneOf,
  readRecord,
  readString,
  readStrings,
} from '../json/record.ts'
import { readSecretKinds } from './parse-common.ts'
import {
  type FormHostMessage,
  FormHostMessageType,
  FormMode,
  type FormSetup,
  FormStart,
} from './protocol.ts'

type Reader = (message: JsonRecord) => FormHostMessage

const FORM_MODES: ReadonlySet<string> = new Set(Object.values(FormMode))
const FORM_STARTS: ReadonlySet<string> = new Set(Object.values(FormStart))
const CONNECTION_FIELDS: ReadonlySet<string> = new Set(Object.values(ConnectionField))

const READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
  [
    FormHostMessageType.Open,
    (message) => ({
      type: FormHostMessageType.Open,
      setup: readSetup(readNested(message, 'setup')),
    }),
  ],
  [FormHostMessageType.ShowImport, () => ({ type: FormHostMessageType.ShowImport })],
  [
    FormHostMessageType.File,
    (message) => ({
      type: FormHostMessageType.File,
      field: readOneOf(message, 'field', isPathField),
      path: readString(message, 'path'),
    }),
  ],
  [
    FormHostMessageType.Tested,
    (message) => ({
      type: FormHostMessageType.Tested,
      isSuccess: readBoolean(message, 'isSuccess'),
      message: readString(message, 'message'),
    }),
  ],
  [
    FormHostMessageType.SaveRefused,
    (message) => ({
      type: FormHostMessageType.SaveRefused,
      message: readString(message, 'message'),
      issues: readList(message, 'issues', readIssue),
    }),
  ],
  [
    FormHostMessageType.Imported,
    (message) => ({
      type: FormHostMessageType.Imported,
      connection: readConnection(readNested(message, 'connection')),
      urlSecrets: readSecretKinds(message, 'urlSecrets'),
      warnings: readStrings(message, 'warnings'),
    }),
  ],
  [
    FormHostMessageType.ImportRefused,
    (message) => ({
      type: FormHostMessageType.ImportRefused,
      message: readString(message, 'message'),
    }),
  ],
  [
    FormHostMessageType.Databases,
    (message) => ({ type: FormHostMessageType.Databases, names: readStrings(message, 'names') }),
  ],
  [
    FormHostMessageType.DatabasesFailed,
    (message) => ({
      type: FormHostMessageType.DatabasesFailed,
      message: readString(message, 'message'),
    }),
  ],
])

function isFormMode(value: unknown): value is FormMode {
  return typeof value === 'string' && FORM_MODES.has(value)
}

function isFormStart(value: unknown): value is FormStart {
  return typeof value === 'string' && FORM_STARTS.has(value)
}

function isConnectionField(value: unknown): value is ConnectionField {
  return typeof value === 'string' && CONNECTION_FIELDS.has(value)
}

// What the extension host sent the connection form, checked field by field: a TypeError names the
// first field that is wrong.
export function parseFormHostMessage(data: unknown): FormHostMessage {
  const message = readRecord(data)
  const read = READERS.get(readString(message, 'type'))
  if (read === undefined) {
    throw new TypeError('"type" must be a known value')
  }
  return read(message)
}

function readSetup(setup: JsonRecord): FormSetup {
  return {
    mode: readOneOf(setup, 'mode', isFormMode),
    start: readOneOf(setup, 'start', isFormStart),
    connection: readConnection(readNested(setup, 'connection')),
    heldSecrets: readSecretKinds(setup, 'heldSecrets'),
    engines: readList(setup, 'engines', readEngine),
    takenNameKeys: readStrings(setup, 'takenNameKeys'),
    productionEnvironments: readStrings(setup, 'productionEnvironments'),
  }
}

function readEngine(engine: JsonRecord): EngineOption {
  return {
    id: readString(engine, 'id'),
    displayName: readString(engine, 'displayName'),
    defaultPort: readCount(engine, 'defaultPort'),
  }
}

function readIssue(issue: JsonRecord): ValidationIssue {
  return {
    field: readOneOf(issue, 'field', isConnectionField),
    message: readString(issue, 'message'),
  }
}
