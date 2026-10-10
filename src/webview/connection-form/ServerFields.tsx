import type { ReactElement } from 'react'

import { SecretKind } from '../../core/connection/secrets.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { BoundText } from './bound-fields.tsx'
import { DatabaseField } from './DatabaseField.tsx'
import type { FormView } from './form-view.ts'
import { HostPortField } from './HostPortField.tsx'
import { SecretField } from './SecretField.tsx'

// Where the server is and who logs in: the host and the port, the user and the password, then the
// database to open.
export const ServerFields = ({ view }: { readonly view: FormView }): ReactElement => (
  <>
    <ServerAddress view={view} />
    <BoundText
      view={view}
      field={ConnectionField.User}
      value={view.state.draft.connection.user}
      isRequired
      write={(connection, user) => ({ ...connection, user })}
    />
    <SecretField view={view} kind={SecretKind.Password} label="Password" emptyText="No password" />
    <DatabaseField view={view} />
  </>
)

const ServerAddress = ({ view }: { readonly view: FormView }): ReactElement => (
  <HostPortField
    view={view}
    host={{
      field: ConnectionField.Host,
      value: view.state.draft.connection.host,
      placeholder: 'localhost',
      write: (connection, host) => ({ ...connection, host }),
    }}
    port={{
      field: ConnectionField.Port,
      value: view.state.draft.connection.port,
      write: (connection, port) => ({ ...connection, port }),
    }}
  />
)
