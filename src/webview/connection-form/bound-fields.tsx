import { type ReactElement, useState } from 'react'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { parsePort } from '../../core/connection/fields.ts'
import type { ConnectionField } from '../../core/connection/validation.ts'
import { TextInput } from './controls.tsx'
import { type FormView, specOf } from './form-view.ts'

type Write<T> = (connection: ConnectionConfig, value: T) => ConnectionConfig

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
      view.actions.edit(field, (connection) => write(connection, text))
    }}
    onBlur={() => {
      view.actions.touch(field)
    }}
  />
)

interface PortFieldProps {
  readonly view: FormView
  readonly field: ConnectionField
  readonly port: number
  readonly write: Write<number>
}

// What the port input shows: what was typed while it stands for the port; else the port itself,
// such as the default port a new engine brought.
function shownPort(typed: string, port: number): string {
  return Object.is(parsePort(typed) ?? Number.NaN, port) ? typed : String(port)
}

// A port that is not a whole number from 1 to 65535 is no port (NaN) until the user fixes it.
export const PortField = ({ view, field, port, write }: PortFieldProps): ReactElement => {
  const [typed, setTyped] = useState(() => String(port))
  return (
    <TextInput
      spec={specOf(view, field, true)}
      value={shownPort(typed, port)}
      className="port-input"
      inputMode="numeric"
      onChange={(text) => {
        setTyped(text)
        view.actions.edit(field, (connection) => write(connection, parsePort(text) ?? Number.NaN))
      }}
      onBlur={() => {
        view.actions.touch(field)
      }}
    />
  )
}
