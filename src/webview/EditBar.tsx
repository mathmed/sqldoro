import type { ReactElement } from 'react'

import { EditKind } from '../core/edits/edit-kind.ts'
import { EditingState, type ResultTab, type TabEditing } from '../core/results/protocol.ts'
import { plural } from '../core/results/tabs.ts'
import type { EditActions } from './edit-messages.ts'

interface EditBarProps {
  readonly tab: ResultTab
  readonly hasSelection: boolean
  readonly actions: EditActions
}

interface ButtonSpec {
  readonly label: string
  readonly kind: EditKind
  readonly isOnSelection: boolean
  readonly isAdding: boolean
}

const ROW_BUTTONS: readonly ButtonSpec[] = [
  { label: 'Add Row', kind: EditKind.Insert, isOnSelection: false, isAdding: true },
  { label: 'Duplicate', kind: EditKind.Duplicate, isOnSelection: true, isAdding: true },
  { label: 'Delete', kind: EditKind.Delete, isOnSelection: true, isAdding: false },
]
const CELL_BUTTONS: readonly ButtonSpec[] = [
  { label: 'Set NULL', kind: EditKind.SetNull, isOnSelection: true, isAdding: false },
  { label: 'Set Default', kind: EditKind.SetDefault, isOnSelection: true, isAdding: false },
  { label: 'Revert', kind: EditKind.Revert, isOnSelection: true, isAdding: false },
]
const SHOWN_STATES: ReadonlySet<string> = new Set([EditingState.Editable, EditingState.Applying])

// Whether the rows can be edited (and why not), their changes, and what can be done with them.
export const EditBar = ({ tab, hasSelection, actions }: EditBarProps): ReactElement | null => {
  const { editing } = tab
  if (editing.state === EditingState.None) {
    return null
  }
  return (
    <div className="edit-bar" role="region" aria-label="Editing">
      <span className="edit-status">{statusText(editing)}</span>
      {SHOWN_STATES.has(editing.state) ? (
        <EditButtons editing={editing} hasSelection={hasSelection} actions={actions} />
      ) : null}
      <span role="status" className={editing.isNoticeError ? 'edit-notice error' : 'edit-notice'}>
        {editing.notice}
      </span>
    </div>
  )
}

function statusText(editing: TabEditing): string {
  switch (editing.state) {
    case EditingState.Checking:
      return 'Checking whether these rows can be edited…'
    case EditingState.ReadOnly:
      return `Read-only: ${editing.problem}`
    case EditingState.Applying:
      return `Applying the changes to ${editing.table}…`
    default:
      return `Editing ${editing.table}, rows told apart by ${editing.key.join(', ')}${changesText(editing)}`
  }
}

// How many rows changed, and how many of them the filters of the view hide.
function changesText(editing: TabEditing): string {
  const count = editing.rows.length + editing.newRows.length + editing.hiddenRows
  if (count === 0) {
    return ''
  }
  const hidden =
    editing.hiddenRows === 0 ? '' : `, ${String(editing.hiddenRows)} hidden by the filters`
  return ` · ${plural(count, 'changed row', 'changed rows')}${hidden}`
}

interface EditButtonsProps {
  readonly editing: TabEditing
  readonly hasSelection: boolean
  readonly actions: EditActions
}

const EditButtons = ({ editing, hasSelection, actions }: EditButtonsProps): ReactElement => {
  const isApplying = editing.state === EditingState.Applying
  const isEnabled = (spec: ButtonSpec): boolean =>
    !isApplying &&
    (!spec.isOnSelection || hasSelection) &&
    (!spec.isAdding || editing.insertProblem === '')
  return (
    <span className="edit-buttons" role="toolbar" aria-label="Edit the rows">
      <ButtonGroup
        label="Rows"
        specs={ROW_BUTTONS}
        isEnabled={isEnabled}
        actions={actions}
        insertProblem={editing.insertProblem}
      />
      <ButtonGroup
        label="Cells"
        specs={CELL_BUTTONS}
        isEnabled={isEnabled}
        actions={actions}
        insertProblem=""
      />
      <ChangeButtons editing={editing} actions={actions} />
    </span>
  )
}

// Every change goes back, or the statements that apply them show for the user to confirm.
const ChangeButtons = ({
  editing,
  actions,
}: Pick<EditButtonsProps, 'actions' | 'editing'>): ReactElement => {
  const hasChanges = editing.rows.length + editing.newRows.length + editing.hiddenRows > 0
  const isDisabled = editing.state === EditingState.Applying || !hasChanges
  return (
    <span className="button-group" role="group" aria-label="Changes">
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => {
          actions.onResult(EditKind.RevertAll)
        }}
      >
        Revert All
      </button>
      <button
        type="button"
        className="primary"
        title="Ctrl+S"
        disabled={isDisabled}
        onClick={actions.preview}
      >
        Preview Changes…
      </button>
    </span>
  )
}

interface ButtonGroupProps {
  readonly label: string
  readonly specs: readonly ButtonSpec[]
  readonly isEnabled: (spec: ButtonSpec) => boolean
  readonly actions: EditActions
  readonly insertProblem: string
}

const ButtonGroup = ({
  label,
  specs,
  isEnabled,
  actions,
  insertProblem,
}: ButtonGroupProps): ReactElement => (
  <span className="button-group" role="group" aria-label={label}>
    {specs.map((spec) => (
      <button
        key={spec.kind}
        type="button"
        disabled={!isEnabled(spec)}
        title={spec.isAdding && insertProblem !== '' ? insertProblem : undefined}
        onClick={() => {
          if (spec.isOnSelection) {
            actions.onSelection(spec.kind)
            return
          }
          actions.onResult(spec.kind)
        }}
      >
        {spec.label}
      </button>
    ))}
  </span>
)
