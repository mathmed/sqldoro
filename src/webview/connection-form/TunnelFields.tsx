import type { ReactElement } from 'react'

import { SshAuthMethod, type SshTunnelOptions } from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import {
  PathField,
  TunnelChoice,
  tunnelChoiceOf,
  withSsh,
  withTunnel,
} from '../../core/connection/transitions.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { BoundText } from './bound-fields.tsx'
import { type Option, SelectInput } from './controls.tsx'
import { edit, type FormView } from './form-view.ts'
import { HostPortField } from './HostPortField.tsx'
import { PathField as PathInput } from './PathField.tsx'
import { SecretField } from './SecretField.tsx'

const TUNNELS: readonly Option<TunnelChoice>[] = [
  { value: TunnelChoice.None, label: 'None' },
  { value: TunnelChoice.Password, label: 'SSH with password' },
  { value: TunnelChoice.PrivateKey, label: 'SSH with private key' },
]

interface SshFieldsProps {
  readonly view: FormView
  readonly ssh: SshTunnelOptions
}

// Whether the connection goes through an SSH tunnel; once it does, how it logs in to the SSH
// server shows just below: its host and port, its user, then the password, or the private key and
// its passphrase.
export const TunnelFields = ({ view }: { readonly view: FormView }): ReactElement => {
  const { connection } = view.state.draft
  return (
    <>
      <SelectInput
        spec={{ id: 'tunnel', label: 'Tunnel' }}
        value={tunnelChoiceOf(connection)}
        options={TUNNELS}
        onSelect={(choice) => {
          edit(view, null, (changed) => withTunnel(changed, choice))
        }}
      />
      {connection.ssh === undefined ? null : <SshFields view={view} ssh={connection.ssh} />}
    </>
  )
}

const SshFields = ({ view, ssh }: SshFieldsProps): ReactElement => (
  <div className="nested-fields" role="group" aria-label="SSH tunnel">
    <SshAddress view={view} ssh={ssh} />
    <BoundText
      view={view}
      field={ConnectionField.SshUser}
      value={ssh.user}
      isRequired
      write={(connection, user) => withSsh(connection, { user })}
    />
    {ssh.authMethod === SshAuthMethod.Password ? (
      <SecretField
        view={view}
        kind={SecretKind.SshPassword}
        label="SSH password"
        emptyText="No password"
      />
    ) : (
      <KeyFields view={view} />
    )}
  </div>
)

const SshAddress = ({ view, ssh }: SshFieldsProps): ReactElement => (
  <HostPortField
    view={view}
    host={{
      field: ConnectionField.SshHost,
      value: ssh.host,
      placeholder: 'bastion.example.com',
      write: (connection, host) => withSsh(connection, { host }),
    }}
    port={{
      field: ConnectionField.SshPort,
      value: ssh.port,
      write: (connection, port) => withSsh(connection, { port }),
    }}
  />
)

const KeyFields = ({ view }: { readonly view: FormView }): ReactElement => (
  <>
    <PathInput view={view} field={PathField.SshPrivateKey} isRequired />
    <SecretField
      view={view}
      kind={SecretKind.SshPassphrase}
      label="Passphrase"
      emptyText="No passphrase"
    />
  </>
)
