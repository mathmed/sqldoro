import type { ValidationIssue } from '../connection/validation.ts'
import { type FormDraft, secretChangesOf } from './draft.ts'
import { blockingIssues, firstIssue, issuesOf, showIssues } from './form-issues.ts'
import { FormAction, type FormState, ListingState, NO_DATABASES, TestState } from './form-state.ts'
import { FormViewMessageType, type SubmittedDraft } from './protocol.ts'

// Nothing is sent while a save runs; a test or a listing waits for the one that runs.
export function canSubmit(state: FormState, action: FormAction): boolean {
  if (state.isSaving) {
    return false
  }
  switch (action) {
    case FormAction.Test:
      return state.test.state !== TestState.Testing
    case FormAction.ListDatabases:
      return state.databases.state !== ListingState.Listing
    case FormAction.Save:
      return true
  }
}

// Sends the draft to test or save it, or to list the databases of its server; with problems, shows
// them all and takes the user to the first one instead.
export function submit(state: FormState, action: FormAction): FormState {
  if (!canSubmit(state, action)) {
    return state
  }
  const issues = blockingIssues(issuesOf(state), action)
  const first = firstIssue(issues)
  if (first !== undefined) {
    return showIssues(state, issues, first)
  }
  return started(state, action, submittedDraft(state.draft))
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
  const first = firstIssue(issues)
  return first === undefined ? refused : showIssues(refused, issues, first)
}

function started(state: FormState, action: FormAction, draft: SubmittedDraft): FormState {
  switch (action) {
    case FormAction.Save:
      return {
        ...state,
        isSaving: true,
        notice: '',
        submission: { type: FormViewMessageType.Save, draft },
      }
    case FormAction.Test:
      return {
        ...state,
        test: { state: TestState.Testing, message: '' },
        submission: { type: FormViewMessageType.Test, draft },
      }
    case FormAction.ListDatabases:
      return {
        ...state,
        databases: { ...NO_DATABASES, state: ListingState.Listing },
        submission: { type: FormViewMessageType.ListDatabases, draft },
      }
  }
}

function submittedDraft(draft: FormDraft): SubmittedDraft {
  return { connection: draft.connection, secretChanges: secretChangesOf(draft) }
}
