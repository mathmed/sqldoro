import {
  editConnection,
  type FormControl,
  type FormState,
  touchField,
} from '../../core/connection-form/form-state.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { FIELD_LABELS, labelOf } from '../../core/connection/labels.ts'
import type { PathField } from '../../core/connection/transitions.ts'
import type { ConnectionField } from '../../core/connection/validation.ts'

// What the user can do in the form: change its state, whose requests to the extension are sent
// once each, and ask the extension for what only it can do.
export interface FormActions {
  readonly update: (change: (state: FormState) => FormState) => void
  // The file dialog of a path field: a webview cannot open one.
  readonly browse: (field: PathField) => void
  readonly cancel: () => void
}

// What the parts of the form render from: the state, what the user can do, and the problem each
// field shows.
export interface FormView {
  readonly state: FormState
  readonly actions: FormActions
  readonly issues: ReadonlyMap<ConnectionField, string>
}

// How a control is labelled and described.
export interface FieldSpec {
  readonly id: string
  readonly label: string
  readonly isRequired?: boolean
  readonly issue?: string | undefined
  readonly help?: string | undefined
}

// The id of the control of a field, which the form focuses when it takes the user there.
export function fieldId(control: FormControl): string {
  return `field-${control}`
}

export function specOf(view: FormView, field: ConnectionField, isRequired = false): FieldSpec {
  return {
    id: fieldId(field),
    label: labelOf(FIELD_LABELS, field),
    isRequired,
    issue: view.issues.get(field),
  }
}

// Changes the connection: a field, when given, shows its problems from now on.
export function edit(
  view: FormView,
  field: ConnectionField | null,
  change: (connection: ConnectionConfig) => ConnectionConfig,
): void {
  view.actions.update((state) => editConnection(state, field, change))
}

// The user left a field: its problems show from now on.
export function touch(view: FormView, field: ConnectionField): void {
  view.actions.update((state) => touchField(state, field))
}
