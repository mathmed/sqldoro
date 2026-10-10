import type { ReactElement } from 'react'

import { SslMode } from '../../core/connection/connection.ts'
import { labelOf, SSL_MODE_DETAILS, SSL_MODE_LABELS } from '../../core/connection/labels.ts'
import { PathField, withSsl, withSslMode } from '../../core/connection/transitions.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { FieldRow, type Option, SelectInput, SwitchInput } from './controls.tsx'
import { type FormView, specOf } from './form-view.ts'
import { PathField as PathInput } from './PathField.tsx'

const SSL_MODES: readonly Option<SslMode>[] = Object.values(SslMode).map((mode) => ({
  value: mode,
  label: labelOf(SSL_MODE_LABELS, mode),
}))
const REJECT_HELP = 'Off: the connection is encrypted, but the server is not checked.'

// The SSL mode, with what it means; the certificate files once SSL is on; and, for require only,
// whether unauthorized certificates are rejected (the verify modes always reject them).
export const SslTab = ({ view }: { readonly view: FormView }): ReactElement => {
  const { ssl } = view.state.draft.connection
  return (
    <>
      <FieldRow>
        <SelectInput
          spec={{
            ...specOf(view, ConnectionField.SslMode),
            help: labelOf(SSL_MODE_DETAILS, ssl.mode),
          }}
          value={ssl.mode}
          options={SSL_MODES}
          onSelect={(mode) => {
            view.actions.edit(ConnectionField.SslMode, (connection) =>
              withSslMode(connection, mode),
            )
          }}
        />
        {ssl.mode === SslMode.Require ? <RejectSwitch view={view} /> : null}
      </FieldRow>
      {ssl.mode === SslMode.Disable ? null : <CertificateFiles view={view} />}
    </>
  )
}

const RejectSwitch = ({ view }: { readonly view: FormView }): ReactElement => (
  <SwitchInput
    spec={{
      id: 'reject-unauthorized',
      label: 'Reject unauthorized certificates',
      help: REJECT_HELP,
    }}
    isOn={view.state.draft.connection.ssl.shouldRejectUnauthorized}
    onToggle={(isOn) => {
      view.actions.edit(ConnectionField.SslMode, (connection) =>
        withSsl(connection, { shouldRejectUnauthorized: isOn }),
      )
    }}
  />
)

const CertificateFiles = ({ view }: { readonly view: FormView }): ReactElement => (
  <>
    <FieldRow>
      <PathInput view={view} field={PathField.SslCa} />
      <PathInput view={view} field={PathField.SslCert} />
    </FieldRow>
    <FieldRow>
      <PathInput view={view} field={PathField.SslKey} />
    </FieldRow>
  </>
)
