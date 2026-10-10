import type { KeyboardEvent, ReactElement } from 'react'

import { applyImport, closeImport, typeImport } from '../../core/connection-form/form-flow.ts'
import { FormControl } from '../../core/connection-form/form-state.ts'
import { Icon, IconName } from '../icons.tsx'
import { describedBy, FieldFrame } from './controls.tsx'
import { fieldId, type FieldSpec, type FormView } from './form-view.ts'

const HELP =
  "A URL such as postgres://user:password@host:5432/database. Its password is saved in VS Code's secret storage."
const KEYS: ReadonlyMap<string, typeof applyImport> = new Map([
  ['Enter', applyImport],
  ['Escape', closeImport],
])

// The input of a connection string, masked as it may hold a password: Apply (or Enter) has the
// extension read it into the fields; Escape closes it.
export const ImportPanel = ({ view }: { readonly view: FormView }): ReactElement => {
  const { importer } = view.state
  const spec: FieldSpec = {
    id: fieldId(FormControl.ConnectionString),
    label: 'Connection string',
    issue: importer.problem === '' ? undefined : importer.problem,
    help: HELP,
  }
  return (
    <section className="import-panel" aria-label="Import connection string">
      <FieldFrame spec={spec}>
        <span className="input-row">
          <ImportInput view={view} spec={spec} />
          <button
            type="button"
            className="primary"
            disabled={importer.isApplying}
            onClick={() => {
              view.actions.update(applyImport)
            }}
          >
            Apply
          </button>
          <CloseButton view={view} />
        </span>
      </FieldFrame>
    </section>
  )
}

const ImportInput = ({
  view,
  spec,
}: {
  readonly view: FormView
  readonly spec: FieldSpec
}): ReactElement => (
  <input
    id={spec.id}
    type="password"
    value={view.state.importer.text}
    placeholder="postgres://user:password@host:5432/database"
    autoComplete="off"
    spellCheck={false}
    {...describedBy(spec)}
    onChange={(event) => {
      view.actions.update((state) => typeImport(state, event.target.value))
    }}
    onKeyDown={(event: KeyboardEvent) => {
      const change = KEYS.get(event.key)
      if (change !== undefined) {
        event.preventDefault()
        view.actions.update(change)
      }
    }}
  />
)

const CloseButton = ({ view }: { readonly view: FormView }): ReactElement => (
  <button
    type="button"
    className="icon-button"
    aria-label="Close the connection string"
    onClick={() => {
      view.actions.update(closeImport)
    }}
  >
    <Icon name={IconName.Close} />
  </button>
)

// What the last connection string held that was ignored, once each.
export const ImportWarnings = ({
  warnings,
}: {
  readonly warnings: readonly string[]
}): ReactElement | null =>
  warnings.length === 0 ? null : (
    <div role="note" aria-label="About the connection string" className="form-notice">
      <ul>
        {[...new Set(warnings)].map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  )
