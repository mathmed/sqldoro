import type { ReactElement } from 'react'

import { SecretKind } from '../../core/connection/secrets.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { BoundText, PortField } from './bound-fields.tsx'
import { FieldRow } from './controls.tsx'
import type { FormView } from './form-view.ts'
import { SecretField } from './SecretField.tsx'

interface ViewProps {
  readonly view: FormView
}

// Where the server is and who logs in: host and port, then user and password, then the database.
export const MainTab = ({ view }: ViewProps): ReactElement => (
  <>
    <ServerFields view={view} />
    <LoginFields view={view} />
    <FieldRow>
      <BoundText
        view={view}
        field={ConnectionField.Database}
        value={view.state.draft.connection.database}
        placeholder="Default database"
        write={(connection, database) => ({ ...connection, database })}
      />
    </FieldRow>
  </>
)

const ServerFields = ({ view }: ViewProps): ReactElement => (
  <FieldRow>
    <BoundText
      view={view}
      field={ConnectionField.Host}
      value={view.state.draft.connection.host}
      isRequired
      write={(connection, host) => ({ ...connection, host })}
    />
    <PortField
      view={view}
      field={ConnectionField.Port}
      port={view.state.draft.connection.port}
      write={(connection, port) => ({ ...connection, port })}
    />
  </FieldRow>
)

const LoginFields = ({ view }: ViewProps): ReactElement => (
  <FieldRow>
    <BoundText
      view={view}
      field={ConnectionField.User}
      value={view.state.draft.connection.user}
      isRequired
      write={(connection, user) => ({ ...connection, user })}
    />
    <SecretField view={view} kind={SecretKind.Password} label="Password" emptyText="No password" />
  </FieldRow>
)
