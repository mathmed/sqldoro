import type { ConfigTab, FormState } from '../../core/connection-form/form-state.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { FIELD_LABELS, labelOf } from '../../core/connection/labels.ts'
import type { SecretKind } from '../../core/connection/secrets.ts'
import type { PathField } from '../../core/connection/transitions.ts'
import type { ConnectionField } from '../../core/connection/validation.ts'

// What the user can do in the form.
export interface FormActions {
  readonly edit: (
    field: ConnectionField | null,
    change: (connection: ConnectionConfig) => ConnectionConfig,
  ) => void
  readonly typeSecret: (kind: SecretKind, value: string) => void
  readonly removeSecret: (kind: SecretKind) => void
  readonly keepSecret: (kind: SecretKind) => void
  readonly touch: (field: ConnectionField) => void
  readonly selectTab: (tab: ConfigTab) => void
  readonly browse: (field: PathField) => void
  readonly test: () => void
  readonly save: () => void
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
export function fieldId(field: ConnectionField): string {
  return `field-${field}`
}

export function specOf(view: FormView, field: ConnectionField, isRequired = false): FieldSpec {
  return {
    id: fieldId(field),
    label: labelOf(FIELD_LABELS, field),
    isRequired,
    issue: view.issues.get(field),
  }
}
