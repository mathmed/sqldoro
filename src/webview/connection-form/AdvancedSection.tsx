import type { ReactElement } from 'react'

import { openAdvanced, toggleAdvanced } from '../../core/connection-form/form-flow.ts'
import { hasAdvancedIssues } from '../../core/connection-form/form-issues.ts'
import { SslMode } from '../../core/connection/connection.ts'
import { labelOf, SSL_MODE_DETAILS, SSL_MODE_LABELS } from '../../core/connection/labels.ts'
import { PathField, withSsl, withSslMode } from '../../core/connection/transitions.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { Icon, IconName } from '../icons.tsx'
import { type Option, SelectInput, SwitchInput } from './controls.tsx'
import { edit, type FormView, specOf } from './form-view.ts'
import { PathField as PathInput } from './PathField.tsx'

const PANEL_ID = 'advanced-settings'
const SSL_MODES: readonly Option<SslMode>[] = Object.values(SslMode).map((mode) => ({
  value: mode,
  label: labelOf(SSL_MODE_LABELS, mode),
}))
const REJECT_HELP = 'Off: the connection is encrypted, but the server is not checked.'

// The SSL line says how the connection is encrypted and opens the SSL settings; they fold away
// under the advanced settings, which open by themselves when SSL is on or has a problem.
export const AdvancedSection = ({ view }: { readonly view: FormView }): ReactElement => (
  <>
    <SslStatus view={view} />
    <div className="advanced">
      <AdvancedToggle view={view} />
      {view.state.isAdvancedOpen ? <SslFields view={view} /> : null}
    </div>
  </>
)

const AdvancedToggle = ({ view }: { readonly view: FormView }): ReactElement => (
  <button
    type="button"
    className="advanced-toggle"
    aria-expanded={view.state.isAdvancedOpen}
    aria-controls={PANEL_ID}
    onClick={() => {
      view.actions.update(toggleAdvanced)
    }}
  >
    <Icon name={IconName.Sliders} />
    <span className="advanced-title">Advanced settings</span>{' '}
    <span className="advanced-detail">· SSL/TLS certificates</span>
    {hasAdvancedIssues(view.issues) ? (
      <span className="issue-mark" role="img" aria-label="has problems">
        !
      </span>
    ) : null}
    <Icon name={IconName.Chevron} />
  </button>
)

const SslStatus = ({ view }: { readonly view: FormView }): ReactElement => {
  const { mode } = view.state.draft.connection.ssl
  const isOff = mode === SslMode.Disable
  return (
    <button
      type="button"
      className="ssl-status"
      onClick={() => {
        view.actions.update(openAdvanced)
      }}
    >
      <Icon name={isOff ? IconName.Unlock : IconName.Lock} />
      {isOff ? 'SSL off' : `SSL: ${mode}`}
    </button>
  )
}

// The SSL mode, with what it means; the certificate files once SSL is on; and, for require only,
// whether unauthorized certificates are rejected (the verify modes always reject them).
const SslFields = ({ view }: { readonly view: FormView }): ReactElement => {
  const { ssl } = view.state.draft.connection
  return (
    <div id={PANEL_ID} className="advanced-panel">
      <SelectInput
        spec={{
          ...specOf(view, ConnectionField.SslMode),
          help: labelOf(SSL_MODE_DETAILS, ssl.mode),
        }}
        value={ssl.mode}
        options={SSL_MODES}
        onSelect={(mode) => {
          edit(view, ConnectionField.SslMode, (connection) => withSslMode(connection, mode))
        }}
      />
      {ssl.mode === SslMode.Require ? <RejectSwitch view={view} /> : null}
      {ssl.mode === SslMode.Disable ? null : <CertificateFiles view={view} />}
    </div>
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
      edit(view, ConnectionField.SslMode, (connection) =>
        withSsl(connection, { shouldRejectUnauthorized: isOn }),
      )
    }}
  />
)

const CertificateFiles = ({ view }: { readonly view: FormView }): ReactElement => (
  <>
    <PathInput view={view} field={PathField.SslCa} />
    <PathInput view={view} field={PathField.SslCert} />
    <PathInput view={view} field={PathField.SslKey} />
  </>
)
