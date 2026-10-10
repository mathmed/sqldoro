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
import { BoundText, PortField } from './bound-fields.tsx'
import { FieldRow, type Option, SelectInput } from './controls.tsx'
import type { FormView } from './form-view.ts'
import { PathField as PathInput } from './PathField.tsx'
import { SecretField } from './SecretField.tsx'

const TUNNELS: readonly Option<TunnelChoice>[] = [
  { value: TunnelChoice.None, label: 'No tunnel' },
  { value: TunnelChoice.Password, label: 'SSH with a password' },
  { value: TunnelChoice.PrivateKey, label: 'SSH with a private key' },
]
const TUNNEL_HELP = 'An SSH server that can reach the database; sqldoro connects through it.'

// Whether the connection goes through an SSH tunnel, and how it logs in to the SSH server: its host
// and port, then its user with the password, or the user, then the private key and its passphrase.
export const SshTab = ({ view }: { readonly view: FormView }): ReactElement => {
  const { connection } = view.state.draft
  return (
    <>
      <FieldRow>
        <SelectInput
          spec={{ id: 'tunnel', label: 'Tunnel', help: TUNNEL_HELP }}
          value={tunnelChoiceOf(connection)}
          options={TUNNELS}
          onSelect={(choice) => {
            view.actions.edit(null, (changed) => withTunnel(changed, choice))
          }}
        />
      </FieldRow>
      {connection.ssh === undefined ? null : <TunnelFields view={view} ssh={connection.ssh} />}
    </>
  )
}

interface TunnelFieldsProps {
  readonly view: FormView
  readonly ssh: SshTunnelOptions
}

const TunnelFields = ({ view, ssh }: TunnelFieldsProps): ReactElement => (
  <>
    <SshServerFields view={view} ssh={ssh} />
    {ssh.authMethod === SshAuthMethod.Password ? (
      <FieldRow>
        <SshUserField view={view} ssh={ssh} />
        <SecretField
          view={view}
          kind={SecretKind.SshPassword}
          label="SSH password"
          emptyText="No password"
        />
      </FieldRow>
    ) : (
      <KeyFields view={view} ssh={ssh} />
    )}
  </>
)

const SshServerFields = ({ view, ssh }: TunnelFieldsProps): ReactElement => (
  <FieldRow>
    <BoundText
      view={view}
      field={ConnectionField.SshHost}
      value={ssh.host}
      isRequired
      write={(connection, host) => withSsh(connection, { host })}
    />
    <PortField
      view={view}
      field={ConnectionField.SshPort}
      port={ssh.port}
      write={(connection, port) => withSsh(connection, { port })}
    />
  </FieldRow>
)

const SshUserField = ({ view, ssh }: TunnelFieldsProps): ReactElement => (
  <BoundText
    view={view}
    field={ConnectionField.SshUser}
    value={ssh.user}
    isRequired
    write={(connection, user) => withSsh(connection, { user })}
  />
)

const KeyFields = ({ view, ssh }: TunnelFieldsProps): ReactElement => (
  <>
    <FieldRow>
      <SshUserField view={view} ssh={ssh} />
    </FieldRow>
    <FieldRow>
      <PathInput view={view} field={PathField.SshPrivateKey} isRequired />
      <SecretField
        view={view}
        kind={SecretKind.SshPassphrase}
        label="Passphrase"
        emptyText="No passphrase"
      />
    </FieldRow>
  </>
)
