import { type ReactElement, useState } from 'react'

import { parsePort } from '../../core/connection/fields.ts'
import type { ConnectionField } from '../../core/connection/validation.ts'
import type { Write } from './bound-fields.tsx'
import { describedBy, FieldFrame } from './controls.tsx'
import { edit, type FieldSpec, type FormView, specOf, touch } from './form-view.ts'

// A field of the connection, its value and how to write it.
interface Binding<T> {
  readonly field: ConnectionField
  readonly value: T
  readonly write: Write<T>
}

interface HostPortFieldProps {
  readonly view: FormView
  readonly host: Binding<string> & { readonly placeholder: string }
  readonly port: Binding<number>
}

// The host and the port of a server in one box, `localhost : 3306`: each part is checked on its
// own, and their problems show under the box.
export const HostPortField = ({ view, host, port }: HostPortFieldProps): ReactElement => {
  const hostSpec = specOf(view, host.field, true)
  const portSpec = specOf(view, port.field, true)
  const isInvalid = hostSpec.issue !== undefined || portSpec.issue !== undefined
  return (
    <FieldFrame spec={hostSpec} also={[portSpec]}>
      <span className={isInvalid ? 'input-box host-port invalid' : 'input-box host-port'}>
        <HostInput view={view} spec={hostSpec} host={host} />
        <span className="host-port-separator" aria-hidden="true">
          :
        </span>
        <PortInput view={view} spec={portSpec} port={port} />
      </span>
    </FieldFrame>
  )
}

interface HostInputProps {
  readonly view: FormView
  readonly spec: FieldSpec
  readonly host: HostPortFieldProps['host']
}

const HostInput = ({ view, spec, host }: HostInputProps): ReactElement => (
  <input
    id={spec.id}
    type="text"
    className="host-input"
    value={host.value}
    placeholder={host.placeholder}
    spellCheck={false}
    autoComplete="off"
    {...describedBy(spec)}
    onChange={(event) => {
      edit(view, host.field, (connection) => host.write(connection, event.target.value))
    }}
    onBlur={() => {
      touch(view, host.field)
    }}
  />
)

interface PortInputProps {
  readonly view: FormView
  readonly spec: FieldSpec
  readonly port: Binding<number>
}

// What the port input shows: what was typed while it stands for the port; else the port itself,
// such as the default port a new engine brought.
function shownPort(typed: string, port: number): string {
  return Object.is(parsePort(typed) ?? Number.NaN, port) ? typed : String(port)
}

// A port that is not a whole number from 1 to 65535 is no port (NaN) until the user fixes it.
const PortInput = ({ view, spec, port }: PortInputProps): ReactElement => {
  const [typed, setTyped] = useState(() => String(port.value))
  return (
    <input
      id={spec.id}
      type="text"
      className="port-input"
      inputMode="numeric"
      aria-label={spec.label}
      value={shownPort(typed, port.value)}
      spellCheck={false}
      autoComplete="off"
      {...describedBy(spec)}
      onChange={(event) => {
        const text = event.target.value
        setTyped(text)
        edit(view, port.field, (connection) =>
          port.write(connection, parsePort(text) ?? Number.NaN),
        )
      }}
      onBlur={() => {
        touch(view, port.field)
      }}
    />
  )
}
