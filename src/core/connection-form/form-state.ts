import { type ConnectionConfig, SslMode, type SslOptions } from '../connection/connection.ts'
import type { SecretKind } from '../connection/secrets.ts'
import { type PathField, withPath } from '../connection/transitions.ts'
import { ConnectionField, type ValidationIssue } from '../connection/validation.ts'
import type { GuardPolicy } from '../safety/guard.ts'
import {
  type FormDraft,
  newDraft,
  withConnection,
  withSecretKept,
  withSecretRemoved,
  withTypedSecret,
} from './draft.ts'
import {
  type FormSetup,
  FormStart,
  type FormViewMessage,
  type FormViewMessageType,
} from './protocol.ts'

// The two screens of the form: the engines to choose from, for a new connection, then the fields.
export const FormStep = {
  Picker: 'picker',
  Details: 'details',
} as const

export type FormStep = (typeof FormStep)[keyof typeof FormStep]

export const FormAction = {
  Test: 'test',
  Save: 'save',
  ListDatabases: 'listDatabases',
} as const

export type FormAction = (typeof FormAction)[keyof typeof FormAction]

export const TestState = {
  Idle: 'idle',
  Testing: 'testing',
  Succeeded: 'succeeded',
  Failed: 'failed',
} as const

export type TestState = (typeof TestState)[keyof typeof TestState]

export interface TestStatus {
  readonly state: TestState
  // The server and its version, or the server's error.
  readonly message: string
}

export const ListingState = {
  Idle: 'idle',
  Listing: 'listing',
  Listed: 'listed',
  Failed: 'failed',
} as const

export type ListingState = (typeof ListingState)[keyof typeof ListingState]

// The databases of the server, listed for the user to pick one.
export interface DatabaseListing {
  readonly state: ListingState
  readonly names: readonly string[]
  // The server's error, once the listing failed.
  readonly message: string
  // Whether the names show under the database field.
  readonly isOpen: boolean
}

// The input of a connection string.
export interface ImportState {
  readonly isOpen: boolean
  // What was typed or pasted: it may hold a password, and goes to the extension only to be read.
  readonly text: string
  readonly isApplying: boolean
  // Why the extension could not read it, for people.
  readonly problem: string
  // What the last connection string held that was ignored.
  readonly warnings: readonly string[]
}

// The controls the form can take the user to: the fields of a connection, and the input of a
// connection string.
export const FormControl = { ...ConnectionField, ConnectionString: 'connectionString' } as const

export type FormControl = (typeof FormControl)[keyof typeof FormControl]

// The control the form takes the user to: each new request moves the focus once.
export interface FocusRequest {
  readonly field: FormControl
}

// A message for the extension: each new one is sent once.
export type Submission = Extract<
  FormViewMessage,
  {
    readonly type:
      | typeof FormViewMessageType.Import
      | typeof FormViewMessageType.ListDatabases
      | typeof FormViewMessageType.Save
      | typeof FormViewMessageType.Test
  }
>

export interface FormState {
  readonly setup: FormSetup
  readonly step: FormStep
  readonly draft: FormDraft
  // The fields the user has changed or left: their problems show as they type.
  readonly touched: ReadonlySet<ConnectionField>
  // Once the user tried to test or save, every problem shows.
  readonly isShowingAllIssues: boolean
  // The problems the extension found when it refused to save, until the next change.
  readonly hostIssues: readonly ValidationIssue[]
  // Whether the SSL/TLS settings show.
  readonly isAdvancedOpen: boolean
  readonly importer: ImportState
  readonly databases: DatabaseListing
  readonly test: TestStatus
  readonly isSaving: boolean
  // Why the extension did not save, for people; empty otherwise.
  readonly notice: string
  readonly submission: Submission | null
  readonly focus: FocusRequest
}

const IDLE_TEST: TestStatus = { state: TestState.Idle, message: '' }
export const NO_DATABASES: DatabaseListing = {
  state: ListingState.Idle,
  names: [],
  message: '',
  isOpen: false,
}
export const CLOSED_IMPORT: ImportState = {
  isOpen: false,
  text: '',
  isApplying: false,
  problem: '',
  warnings: [],
}

// A form opens where the extension says, with the SSL settings open when the connection uses SSL,
// and shows no problem before the user acts.
export function openForm(setup: FormSetup): FormState {
  return {
    setup,
    step: setup.start === FormStart.Picker ? FormStep.Picker : FormStep.Details,
    draft: newDraft(setup.connection, new Set(setup.heldSecrets)),
    touched: new Set(),
    isShowingAllIssues: false,
    hostIssues: [],
    isAdvancedOpen: usesSsl(setup.connection.ssl),
    importer: { ...CLOSED_IMPORT, isOpen: setup.start === FormStart.Import },
    databases: NO_DATABASES,
    test: IDLE_TEST,
    isSaving: false,
    notice: '',
    submission: null,
    focus: { field: firstControl(setup.start) },
  }
}

function firstControl(start: FormStart): FormControl {
  switch (start) {
    case FormStart.Picker:
      return FormControl.Engine
    case FormStart.Import:
      return FormControl.ConnectionString
    case FormStart.Details:
      return FormControl.Name
  }
}

// Whether a connection uses SSL, or names certificate files without it.
export function usesSsl(ssl: SslOptions): boolean {
  return (
    ssl.mode !== SslMode.Disable ||
    [ssl.caPath, ssl.certPath, ssl.keyPath].some((path) => path !== '')
  )
}

// A change the user makes: there is nothing to change before the form opens.
export function updateForm(
  state: FormState | null,
  change: (state: FormState) => FormState,
): FormState | null {
  return state === null ? null : change(state)
}

export function policyOf(setup: FormSetup): GuardPolicy {
  return { productionEnvironments: new Set(setup.productionEnvironments) }
}

export function editConnection(
  state: FormState,
  field: ConnectionField | null,
  edit: (connection: ConnectionConfig) => ConnectionConfig,
): FormState {
  const draft = withConnection(state.draft, edit(state.draft.connection))
  return changed({ ...state, draft }, field)
}

export function chooseFile(state: FormState, field: PathField, path: string): FormState {
  return editConnection(state, field, (connection) => withPath(connection, field, path))
}

export function typeSecret(state: FormState, kind: SecretKind, value: string): FormState {
  return changed({ ...state, draft: withTypedSecret(state.draft, kind, value) }, null)
}

export function removeSecret(state: FormState, kind: SecretKind): FormState {
  return changed({ ...state, draft: withSecretRemoved(state.draft, kind) }, null)
}

export function keepSecret(state: FormState, kind: SecretKind): FormState {
  return changed({ ...state, draft: withSecretKept(state.draft, kind) }, null)
}

export function touchField(state: FormState, field: ConnectionField): FormState {
  return state.touched.has(field) ? state : { ...state, touched: new Set(state.touched).add(field) }
}

// Typing changes the draft: what the extension said about the previous one no longer holds, and a
// finished test or listing no longer speaks for it, except the databases listed for the user to
// pick one of.
export function changed(state: FormState, field: ConnectionField | null): FormState {
  return {
    ...state,
    touched: field === null ? state.touched : new Set(state.touched).add(field),
    hostIssues: [],
    notice: '',
    test: state.test.state === TestState.Testing ? state.test : IDLE_TEST,
    databases: isListingKept(state.databases, field) ? state.databases : NO_DATABASES,
  }
}

function isListingKept(listing: DatabaseListing, field: ConnectionField | null): boolean {
  return (
    listing.state === ListingState.Listing ||
    (listing.state === ListingState.Listed && field === ConnectionField.Database)
  )
}
