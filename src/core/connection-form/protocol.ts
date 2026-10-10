// The messages between the extension host and the connection form webview. Both sides validate what
// they receive (parse-host-message.ts, parse-webview-message.ts). Secrets never travel to the form:
// it learns which kinds the extension holds, and sends what the user typed only to test, save, list
// the databases of the server or import a connection string.
import type { ConnectionConfig } from '../connection/connection.ts'
import type { SecretKind } from '../connection/secrets.ts'
import type { PathField } from '../connection/transitions.ts'
import type { ValidationIssue } from '../connection/validation.ts'
import type { EngineOption } from '../engine/engine.ts'
import type { SecretChange } from './draft.ts'

export const FormMode = {
  New: 'new',
  Edit: 'edit',
} as const

export type FormMode = (typeof FormMode)[keyof typeof FormMode]

// Where the form opens: on the engines to choose from, on the fields, or on the fields with the
// input of a connection string open.
export const FormStart = {
  Picker: 'picker',
  Details: 'details',
  Import: 'import',
} as const

export type FormStart = (typeof FormStart)[keyof typeof FormStart]

// What the form needs to open: the connection, and what validating it takes.
export interface FormSetup {
  readonly mode: FormMode
  readonly start: FormStart
  readonly connection: ConnectionConfig
  // The secrets the secret storage holds for the connection.
  readonly heldSecrets: readonly SecretKind[]
  // The registered engines, in order: the first one is the default.
  readonly engines: readonly EngineOption[]
  // Name keys (see nameKey) of the other connections.
  readonly takenNameKeys: readonly string[]
  // The environment tags the settings treat as production.
  readonly productionEnvironments: readonly string[]
}

// The connection to test, save or list the databases of, and the secrets typed for it.
export interface SubmittedDraft {
  readonly connection: ConnectionConfig
  readonly secretChanges: readonly SecretChange[]
}

// What a connection string holds, for the connection of the form: the extension keeps its secrets
// and only says which kinds they are, and what it ignored.
export interface ImportedDraft {
  readonly connection: ConnectionConfig
  readonly urlSecrets: readonly SecretKind[]
  readonly warnings: readonly string[]
}

export const FormHostMessageType = {
  Open: 'open',
  ShowImport: 'showImport',
  File: 'file',
  Tested: 'tested',
  SaveRefused: 'saveRefused',
  Imported: 'imported',
  ImportRefused: 'importRefused',
  Databases: 'databases',
  DatabasesFailed: 'databasesFailed',
} as const

export type FormHostMessage =
  | { readonly type: typeof FormHostMessageType.Open; readonly setup: FormSetup }
  // Import Connection from URL, for a form that is already open.
  | { readonly type: typeof FormHostMessageType.ShowImport }
  // The file the user chose for a path field.
  | {
      readonly type: typeof FormHostMessageType.File
      readonly field: PathField
      readonly path: string
    }
  // How a test went: the server and its version, or the server's error.
  | {
      readonly type: typeof FormHostMessageType.Tested
      readonly isSuccess: boolean
      readonly message: string
    }
  // Why the extension did not save: a message for people, and the fields at fault.
  | {
      readonly type: typeof FormHostMessageType.SaveRefused
      readonly message: string
      readonly issues: readonly ValidationIssue[]
    }
  | ({ readonly type: typeof FormHostMessageType.Imported } & ImportedDraft)
  // Why a connection string cannot be imported.
  | { readonly type: typeof FormHostMessageType.ImportRefused; readonly message: string }
  // The databases of the server, by name.
  | { readonly type: typeof FormHostMessageType.Databases; readonly names: readonly string[] }
  // Why the databases of the server could not be listed: the server's error.
  | { readonly type: typeof FormHostMessageType.DatabasesFailed; readonly message: string }

export const FormViewMessageType = {
  Ready: 'ready',
  Browse: 'browse',
  Test: 'test',
  Save: 'save',
  Import: 'import',
  ListDatabases: 'listDatabases',
  Cancel: 'cancel',
  Problem: 'problem',
} as const

export type FormViewMessage =
  | { readonly type: typeof FormViewMessageType.Ready }
  // Asks for the file dialog of a path field: the webview cannot open one.
  | { readonly type: typeof FormViewMessageType.Browse; readonly field: PathField }
  | { readonly type: typeof FormViewMessageType.Test; readonly draft: SubmittedDraft }
  | { readonly type: typeof FormViewMessageType.Save; readonly draft: SubmittedDraft }
  // A connection string to read: it may hold a password.
  | { readonly type: typeof FormViewMessageType.Import; readonly text: string }
  | { readonly type: typeof FormViewMessageType.ListDatabases; readonly draft: SubmittedDraft }
  | { readonly type: typeof FormViewMessageType.Cancel }
  // Something the webview could not handle, for the extension's log.
  | { readonly type: typeof FormViewMessageType.Problem; readonly message: string }
