import type { ConnectionConfig } from '../connection/connection.ts'
import type { SecretKind } from '../connection/secrets.ts'
import { type PathField, withPath } from '../connection/transitions.ts'
import {
  ConnectionField,
  validateConnection,
  type ValidationIssue,
} from '../connection/validation.ts'
import type { GuardPolicy } from '../safety/guard.ts'
import {
  type FormDraft,
  newDraft,
  secretChangesOf,
  withConnection,
  withSecretKept,
  withSecretRemoved,
  withTypedSecret,
} from './draft.ts'
import {
  type FormHostMessage,
  FormHostMessageType,
  type FormSetup,
  type SubmittedDraft,
} from './protocol.ts'

// The tabs of the settings under the engine; the name, the environment and the read-only switch
// stay above them, always in sight.
export const ConfigTab = {
  Main: 'main',
  Ssl: 'ssl',
  Ssh: 'ssh',
} as const

export type ConfigTab = (typeof ConfigTab)[keyof typeof ConfigTab]

export const FormAction = {
  Test: 'test',
  Save: 'save',
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

// A request for the extension: each new one is sent once.
export interface Submission {
  readonly action: FormAction
  readonly draft: SubmittedDraft
}

// The field the form takes the user to: each new request moves the focus once.
export interface FocusRequest {
  readonly field: ConnectionField
}

export interface FormState {
  readonly setup: FormSetup
  readonly draft: FormDraft
  // The fields the user has changed or left: their problems show as they type.
  readonly touched: ReadonlySet<ConnectionField>
  // Once the user tried to test or save, every problem shows.
  readonly isShowingAllIssues: boolean
  // The problems the extension found when it refused to save, until the next change.
  readonly hostIssues: readonly ValidationIssue[]
  readonly activeTab: ConfigTab
  readonly test: TestStatus
  readonly isSaving: boolean
  // Why the extension did not save, for people; empty otherwise.
  readonly notice: string
  readonly submission: Submission | null
  readonly focus: FocusRequest
}

type HostUpdate = Exclude<FormHostMessage, { readonly type: typeof FormHostMessageType.Open }>

const FIELD_TABS: ReadonlyMap<ConnectionField, ConfigTab> = new Map([
  [ConnectionField.Host, ConfigTab.Main],
  [ConnectionField.Port, ConfigTab.Main],
  [ConnectionField.User, ConfigTab.Main],
  [ConnectionField.Database, ConfigTab.Main],
  [ConnectionField.SslMode, ConfigTab.Ssl],
  [ConnectionField.SslCaPath, ConfigTab.Ssl],
  [ConnectionField.SslCertPath, ConfigTab.Ssl],
  [ConnectionField.SslKeyPath, ConfigTab.Ssl],
  [ConnectionField.SshHost, ConfigTab.Ssh],
  [ConnectionField.SshPort, ConfigTab.Ssh],
  [ConnectionField.SshUser, ConfigTab.Ssh],
  [ConnectionField.SshPrivateKeyPath, ConfigTab.Ssh],
])
const IDLE: TestStatus = { state: TestState.Idle, message: '' }

// A form opens on the main tab with the name in focus, and shows no problem before the user acts.
export function openForm(setup: FormSetup): FormState {
  return {
    setup,
    draft: newDraft(setup.connection, new Set(setup.heldSecrets)),
    touched: new Set(),
    isShowingAllIssues: false,
    hostIssues: [],
    activeTab: ConfigTab.Main,
    test: IDLE,
    isSaving: false,
    notice: '',
    submission: null,
    focus: { field: ConnectionField.Name },
  }
}

// The form before it opens is null: only the message that opens it changes that.
export function receiveHostMessage(
  state: FormState | null,
  message: FormHostMessage,
): FormState | null {
  if (message.type === FormHostMessageType.Open) {
    return openForm(message.setup)
  }
  return updateForm(state, (open) => applyHostUpdate(open, message))
}

// A change the user makes: there is nothing to change before the form opens.
export function updateForm(
  state: FormState | null,
  change: (state: FormState) => FormState,
): FormState | null {
  return state === null ? null : change(state)
}

function applyHostUpdate(state: FormState, message: HostUpdate): FormState {
  switch (message.type) {
    case FormHostMessageType.File:
      return chooseFile(state, message.field, message.path)
    case FormHostMessageType.Tested:
      return finishTest(state, message.isSuccess, message.message)
    case FormHostMessageType.SaveRefused:
      return refuseSave(state, message.message, message.issues)
  }
}

export function policyOf(setup: FormSetup): GuardPolicy {
  return { productionEnvironments: new Set(setup.productionEnvironments) }
}

// Every problem of the connection: those the form finds, then those the extension reported.
export function issuesOf(state: FormState): readonly ValidationIssue[] {
  const { engines, takenNameKeys } = state.setup
  const found = validateConnection(state.draft.connection, {
    engines,
    takenNameKeys: new Set(takenNameKeys),
  })
  return [...found, ...state.hostIssues]
}

// The first problem of each field the form shows: touched fields only, until the user tries to
// test or save.
export function shownIssues(state: FormState): ReadonlyMap<ConnectionField, string> {
  const shown = issuesOf(state).filter(
    (issue) => state.isShowingAllIssues || state.touched.has(issue.field),
  )
  return new Map(shown.toReversed().map((issue) => [issue.field, issue.message]))
}

// The tabs whose fields show a problem.
export function tabsWithIssues(
  shown: ReadonlyMap<ConnectionField, string>,
): ReadonlySet<ConfigTab> {
  return new Set([...shown.keys()].flatMap((field) => tabsOf([field])))
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

export function selectTab(state: FormState, tab: ConfigTab): FormState {
  return { ...state, activeTab: tab }
}

// What stands in the way of an action: a test does not need a name.
export function blockingIssues(
  issues: readonly ValidationIssue[],
  action: FormAction,
): readonly ValidationIssue[] {
  return action === FormAction.Save
    ? issues
    : issues.filter((issue) => issue.field !== ConnectionField.Name)
}

// Nothing is sent while a save runs, and a test waits for the one that runs.
export function canSubmit(state: FormState, action: FormAction): boolean {
  const isTesting = state.test.state === TestState.Testing
  return !state.isSaving && !(action === FormAction.Test && isTesting)
}

// Sends the draft to test or save it; with problems, shows them all and takes the user to the
// first one instead.
export function submit(state: FormState, action: FormAction): FormState {
  if (!canSubmit(state, action)) {
    return state
  }
  const issues = blockingIssues(issuesOf(state), action)
  const [first] = issues
  if (first !== undefined) {
    return showIssues(state, issues, first)
  }
  const submission = { action, draft: submittedDraft(state.draft) }
  return action === FormAction.Save
    ? { ...state, isSaving: true, notice: '', submission }
    : { ...state, test: { state: TestState.Testing, message: '' }, submission }
}

export function finishTest(state: FormState, isSuccess: boolean, message: string): FormState {
  return {
    ...state,
    test: { state: isSuccess ? TestState.Succeeded : TestState.Failed, message },
  }
}

// The extension found problems, or could not save: the form says why and shows where.
export function refuseSave(
  state: FormState,
  message: string,
  issues: readonly ValidationIssue[],
): FormState {
  const refused = { ...state, isSaving: false, notice: message, hostIssues: issues }
  const [first] = issues
  return first === undefined ? refused : showIssues(refused, issues, first)
}

// Typing changes the draft: what the extension said about the previous one no longer holds, and a
// finished test no longer speaks for it.
function changed(state: FormState, field: ConnectionField | null): FormState {
  return {
    ...state,
    touched: field === null ? state.touched : new Set(state.touched).add(field),
    hostIssues: [],
    notice: '',
    test: state.test.state === TestState.Testing ? state.test : IDLE,
  }
}

// Every problem shows; the first tab with one comes to the front, and the first field with one
// takes the focus.
function showIssues(
  state: FormState,
  issues: readonly ValidationIssue[],
  first: ValidationIssue,
): FormState {
  const [tab = state.activeTab] = tabsOf(issues.map((issue) => issue.field))
  return { ...state, isShowingAllIssues: true, activeTab: tab, focus: { field: first.field } }
}

function tabsOf(fields: readonly ConnectionField[]): ConfigTab[] {
  return fields.flatMap((field) => {
    const tab = FIELD_TABS.get(field)
    return tab === undefined ? [] : [tab]
  })
}

function submittedDraft(draft: FormDraft): SubmittedDraft {
  return { connection: draft.connection, secretChanges: secretChangesOf(draft) }
}
