import type { ReactElement } from 'react'

import { ExportFormat } from '../core/results/export-format.ts'
import { type ResultTab, TabStatus } from '../core/results/protocol.ts'
import { canLoadAll } from '../core/results/tabs.ts'

export interface ToolbarActions {
  readonly cancel: () => void
  readonly loadAll: () => void
  readonly copy: (format: ExportFormat) => void
  // The selected rows, whole, as INSERT statements.
  readonly copyRows: () => void
  readonly export: (format: ExportFormat) => void
  readonly setServerSide: (isServerSide: boolean) => void
}

interface ToolbarProps {
  readonly tab: ResultTab
  readonly hasSelection: boolean
  readonly isServerSide: boolean
  readonly actions: ToolbarActions
}

const COPY_FORMATS: readonly (readonly [ExportFormat, string])[] = [
  [ExportFormat.Csv, 'CSV'],
  [ExportFormat.Json, 'JSON'],
  [ExportFormat.Sql, 'INSERT'],
]
const EXPORT_FORMATS: readonly (readonly [ExportFormat, string])[] = [
  [ExportFormat.Csv, 'CSV'],
  [ExportFormat.Json, 'JSON'],
  [ExportFormat.Sql, 'SQL'],
]

export const Toolbar = (props: ToolbarProps): ReactElement => {
  const { tab, actions } = props
  const isRunning = tab.status === TabStatus.Running
  return (
    <div className="toolbar" role="toolbar" aria-label="Result actions">
      {isRunning ? <CancelButton onClick={actions.cancel} /> : null}
      {canLoadAll(tab) ? <LoadAllButton onClick={actions.loadAll} /> : null}
      <FormatButtons kind="copy" isDisabled={!props.hasSelection} onClick={actions.copy} />
      <button type="button" disabled={!props.hasSelection} onClick={actions.copyRows}>
        Copy Rows as INSERT
      </button>
      <FormatButtons
        kind="export"
        isDisabled={isRunning || tab.columns.length === 0}
        onClick={actions.export}
      />
      {tab.canServerView ? (
        <ServerSideToggle
          isChecked={props.isServerSide}
          isDisabled={isRunning}
          onChange={actions.setServerSide}
        />
      ) : null}
    </div>
  )
}

interface FormatButtonsProps {
  readonly kind: 'copy' | 'export'
  readonly isDisabled: boolean
  readonly onClick: (format: ExportFormat) => void
}

const FormatButtons = ({ kind, isDisabled, onClick }: FormatButtonsProps): ReactElement =>
  kind === 'copy' ? (
    <ButtonGroup
      label="Copy selection as"
      formats={COPY_FORMATS}
      isDisabled={isDisabled}
      onClick={onClick}
    />
  ) : (
    <ButtonGroup
      label="Export as"
      formats={EXPORT_FORMATS}
      isDisabled={isDisabled}
      onClick={onClick}
    />
  )

// The query was cut at the automatic limit: one click runs it again without it.
const LoadAllButton = ({ onClick }: { readonly onClick: () => void }): ReactElement => (
  <button type="button" className="load-all" onClick={onClick}>
    Load All Rows
  </button>
)

const CancelButton = ({ onClick }: { readonly onClick: () => void }): ReactElement => (
  <button type="button" className="cancel" onClick={onClick}>
    Cancel
  </button>
)

interface ServerSideToggleProps {
  readonly isChecked: boolean
  readonly isDisabled: boolean
  readonly onChange: (isServerSide: boolean) => void
}

// Off, the rows already here are sorted and filtered; on, the query runs again on the server.
const ServerSideToggle = ({
  isChecked,
  isDisabled,
  onChange,
}: ServerSideToggleProps): ReactElement => (
  <label className="server-side">
    <input
      type="checkbox"
      checked={isChecked}
      disabled={isDisabled}
      onChange={(event) => {
        onChange(event.target.checked)
      }}
    />
    Sort and filter on the server
  </label>
)

interface ButtonGroupProps {
  readonly label: string
  readonly formats: readonly (readonly [ExportFormat, string])[]
  readonly isDisabled: boolean
  readonly onClick: (format: ExportFormat) => void
}

const ButtonGroup = ({ label, formats, isDisabled, onClick }: ButtonGroupProps): ReactElement => (
  <span className="button-group" role="group" aria-label={label}>
    <span className="group-label">{label}</span>
    {formats.map(([format, name]) => (
      <button
        key={format}
        type="button"
        disabled={isDisabled}
        onClick={() => {
          onClick(format)
        }}
      >
        {name}
      </button>
    ))}
  </span>
)
