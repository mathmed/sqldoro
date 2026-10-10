import type { ReactElement } from 'react'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionField } from '../../core/connection/validation.ts'
import { TextInput } from './controls.tsx'
import { edit, type FormView, specOf, touch } from './form-view.ts'

export type Write<T> = (connection: ConnectionConfig, value: T) => ConnectionConfig

interface BoundTextProps {
  readonly view: FormView
  readonly field: ConnectionField
  readonly value: string
  readonly write: Write<string>
  readonly isRequired?: boolean
  readonly placeholder?: string
}

// A text field of the connection: its problem shows once the user has touched it.
export const BoundText = ({
  view,
  field,
  value,
  write,
  isRequired = false,
  placeholder,
}: BoundTextProps): ReactElement => (
  <TextInput
    spec={specOf(view, field, isRequired)}
    value={value}
    placeholder={placeholder}
    onChange={(text) => {
      edit(view, field, (connection) => write(connection, text))
    }}
    onBlur={() => {
      touch(view, field)
    }}
  />
)
