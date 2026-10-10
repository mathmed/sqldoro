import type { ReactElement } from 'react'

import {
  backToPicker,
  canChangeEngine,
  engineOf,
  openImport,
} from '../../core/connection-form/form-flow.ts'
import { FormMode } from '../../core/connection-form/protocol.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { DatabaseGlyph, Icon, IconName } from '../icons.tsx'
import { fieldId, type FormView } from './form-view.ts'

export const TITLE_ID = 'form-title'
export const SUBTITLE_ID = 'form-subtitle'
const ENGINE_ISSUE_ID = 'engine-issue'

// What the form does with the connection.
export function purposeOf(mode: FormMode): string {
  return mode === FormMode.Edit ? 'Edit connection' : 'New connection'
}

// The engine and what the form does with the connection; a new connection can go back to the
// engines, and any can import a connection string.
export const CardHeader = ({ view }: { readonly view: FormView }): ReactElement => {
  const issue = view.issues.get(ConnectionField.Engine)
  return (
    <header className="card-header">
      {canChangeEngine(view.state) ? (
        <BackButton view={view} hasIssue={issue !== undefined} />
      ) : null}
      <DatabaseGlyph />
      <CardTitle view={view} issue={issue} />
      <ImportLink view={view} />
    </header>
  )
}

interface CardTitleProps {
  readonly view: FormView
  // Why the engine of the connection cannot be used.
  readonly issue: string | undefined
}

// The engine in bold, or the id of one that is not registered, and what is done with it.
const CardTitle = ({ view, issue }: CardTitleProps): ReactElement => (
  <div className="card-title">
    <h1 id={TITLE_ID}>{engineOf(view.state)?.displayName ?? view.state.draft.connection.engine}</h1>
    <p id={SUBTITLE_ID} className="card-subtitle">
      {purposeOf(view.state.setup.mode)}
    </p>
    {issue === undefined ? null : (
      <p id={ENGINE_ISSUE_ID} className="field-issue">
        {issue}
      </p>
    )}
  </div>
)

interface BackButtonProps {
  readonly view: FormView
  readonly hasIssue: boolean
}

// What was typed stays for the engine chosen next.
const BackButton = ({ view, hasIssue }: BackButtonProps): ReactElement => (
  <button
    type="button"
    id={fieldId(ConnectionField.Engine)}
    className="icon-button back-button"
    aria-label="Choose another database"
    aria-describedby={hasIssue ? ENGINE_ISSUE_ID : undefined}
    onClick={() => {
      view.actions.update(backToPicker)
    }}
  >
    <Icon name={IconName.Back} />
  </button>
)

export const ImportLink = ({ view }: { readonly view: FormView }): ReactElement => (
  <button
    type="button"
    className="link-button import-link"
    aria-expanded={view.state.importer.isOpen}
    onClick={() => {
      view.actions.update(openImport)
    }}
  >
    <Icon name={IconName.Link} />
    Import connection string
  </button>
)
