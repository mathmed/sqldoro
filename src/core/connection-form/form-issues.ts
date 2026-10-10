import {
  ConnectionField,
  validateConnection,
  type ValidationIssue,
} from '../connection/validation.ts'
import { FormAction, type FormState } from './form-state.ts'

// The fields as the form shows them, top to bottom: the engine in the header, the server and the
// login, the tunnel, then the SSL settings at the bottom.
const FIELD_ORDER: readonly ConnectionField[] = [
  ConnectionField.Engine,
  ConnectionField.Name,
  ConnectionField.Host,
  ConnectionField.Port,
  ConnectionField.User,
  ConnectionField.Database,
  ConnectionField.SshHost,
  ConnectionField.SshPort,
  ConnectionField.SshUser,
  ConnectionField.SshPrivateKeyPath,
  ConnectionField.SslMode,
  ConnectionField.SslCaPath,
  ConnectionField.SslCertPath,
  ConnectionField.SslKeyPath,
]
// The fields of the advanced section, which folds away.
const ADVANCED_FIELDS: ReadonlySet<ConnectionField> = new Set([
  ConnectionField.SslMode,
  ConnectionField.SslCaPath,
  ConnectionField.SslCertPath,
  ConnectionField.SslKeyPath,
])

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

// Whether a field of the advanced section shows a problem.
export function hasAdvancedIssues(shown: ReadonlyMap<ConnectionField, string>): boolean {
  return [...shown.keys()].some((field) => ADVANCED_FIELDS.has(field))
}

// What stands in the way of an action: only a save needs a name.
export function blockingIssues(
  issues: readonly ValidationIssue[],
  action: FormAction,
): readonly ValidationIssue[] {
  return action === FormAction.Save
    ? issues
    : issues.filter((issue) => issue.field !== ConnectionField.Name)
}

// The problem the user meets first going down the form.
export function firstIssue(issues: readonly ValidationIssue[]): ValidationIssue | undefined {
  return issues.toSorted((left, right) => orderOf(left) - orderOf(right))[0]
}

// Every problem shows: the advanced section opens when it holds one, and the field of the first
// takes the focus.
export function showIssues(
  state: FormState,
  issues: readonly ValidationIssue[],
  first: ValidationIssue,
): FormState {
  return {
    ...state,
    isShowingAllIssues: true,
    isAdvancedOpen: state.isAdvancedOpen || issues.some(({ field }) => ADVANCED_FIELDS.has(field)),
    focus: { field: first.field },
  }
}

function orderOf(issue: ValidationIssue): number {
  return FIELD_ORDER.indexOf(issue.field)
}
