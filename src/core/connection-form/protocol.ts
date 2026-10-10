// The messages between the extension host and the connection form webview. Both sides validate what
// they receive (parse-host-message.ts, parse-webview-message.ts). Secrets never travel to the form:
// it learns which kinds the extension holds, and sends what the user typed only to test or save.
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

// What the form needs to open: the connection, and what validating it takes.
export interface FormSetup {
  readonly mode: FormMode
  readonly connection: ConnectionConfig
  // The secrets the extension holds for the connection: stored, or from an imported URL.
  readonly heldSecrets: readonly SecretKind[]
  // The registered engines, in order: the first one is the default.
  readonly engines: readonly EngineOption[]
  // Name keys (see nameKey) of the other connections.
  readonly takenNameKeys: readonly string[]
  // The environment tags the settings treat as production.
  readonly productionEnvironments: readonly string[]
  // What the form says above its fields, such as what an imported URL held that was ignored.
  readonly notices: readonly string[]
}

// The connection to test or save, and the secrets typed for it.
export interface SubmittedDraft {
  readonly connection: ConnectionConfig
  readonly secretChanges: readonly SecretChange[]
}

export const FormHostMessageType = {
  Open: 'open',
  File: 'file',
  Tested: 'tested',
  SaveRefused: 'saveRefused',
} as const

export type FormHostMessage =
  | { readonly type: typeof FormHostMessageType.Open; readonly setup: FormSetup }
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

export const FormViewMessageType = {
  Ready: 'ready',
  Browse: 'browse',
  Test: 'test',
  Save: 'save',
  Cancel: 'cancel',
  Problem: 'problem',
} as const

export type FormViewMessage =
  | { readonly type: typeof FormViewMessageType.Ready }
  // Asks for the file dialog of a path field: the webview cannot open one.
  | { readonly type: typeof FormViewMessageType.Browse; readonly field: PathField }
  | { readonly type: typeof FormViewMessageType.Test; readonly draft: SubmittedDraft }
  | { readonly type: typeof FormViewMessageType.Save; readonly draft: SubmittedDraft }
  | { readonly type: typeof FormViewMessageType.Cancel }
  // Something the webview could not handle, for the extension's log.
  | { readonly type: typeof FormViewMessageType.Problem; readonly message: string }
