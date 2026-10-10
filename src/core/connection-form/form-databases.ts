import { ConnectionField } from '../connection/validation.ts'
import { editConnection, type FormState, ListingState, NO_DATABASES } from './form-state.ts'

// The databases of the server show under the database field, which takes the focus to pick one.
export function finishListing(state: FormState, names: readonly string[]): FormState {
  return {
    ...state,
    databases: { state: ListingState.Listed, names, message: '', isOpen: names.length > 0 },
    focus: { field: ConnectionField.Database },
  }
}

export function failListing(state: FormState, message: string): FormState {
  return { ...state, databases: { ...NO_DATABASES, state: ListingState.Failed, message } }
}

// The names listed show again, if there are any.
export function showDatabases(state: FormState): FormState {
  return withListOpen(state, state.databases.names.length > 0)
}

export function hideDatabases(state: FormState): FormState {
  return withListOpen(state, false)
}

export function pickDatabase(state: FormState, name: string): FormState {
  const picked = editConnection(state, ConnectionField.Database, (connection) => ({
    ...connection,
    database: name,
  }))
  return hideDatabases(picked)
}

function withListOpen(state: FormState, isOpen: boolean): FormState {
  return { ...state, databases: { ...state.databases, isOpen } }
}
