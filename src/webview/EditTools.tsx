import type { ReactElement } from 'react'

import { EditKind } from '../core/edits/edit-kind.ts'
import { EditingState, type ResultTab, type TabEditing } from '../core/results/protocol.ts'
import type { EditActions } from './edit-messages.ts'
import { IconName } from './icons.tsx'
import { ToolButton, ToolGroup } from './tool-buttons.tsx'

interface EditToolsProps {
  readonly tab: ResultTab
  readonly hasSelection: boolean
  readonly actions: EditActions
}

interface EditSpec {
  readonly label: string
  readonly icon: IconName
  readonly kind: EditKind
  readonly tooltip: string
  readonly isOnSelection: boolean
  readonly isAdding: boolean
}

const ROW_EDITS: readonly EditSpec[] = [
  {
    label: 'Add Row',
    icon: IconName.Add,
    kind: EditKind.Insert,
    tooltip: 'Add a row',
    isOnSelection: false,
    isAdding: true,
  },
  {
    label: 'Duplicate',
    icon: IconName.Duplicate,
    kind: EditKind.Duplicate,
    tooltip: 'Duplicate the selected rows',
    isOnSelection: true,
    isAdding: true,
  },
  {
    label: 'Delete',
    icon: IconName.Trash,
    kind: EditKind.Delete,
    tooltip: 'Mark the selected rows for deletion (Delete)',
    isOnSelection: true,
    isAdding: false,
  },
]
const CELL_EDITS: readonly EditSpec[] = [
  {
    label: 'Set NULL',
    icon: IconName.SetNull,
    kind: EditKind.SetNull,
    tooltip: 'Set the selected cells to NULL',
    isOnSelection: true,
    isAdding: false,
  },
  {
    label: 'Set Default',
    icon: IconName.SetDefault,
    kind: EditKind.SetDefault,
    tooltip: 'Set the selected cells to their default',
    isOnSelection: true,
    isAdding: false,
  },
  {
    label: 'Revert',
    icon: IconName.Discard,
    kind: EditKind.Revert,
    tooltip: 'Revert the changes of the selected cells',
    isOnSelection: true,
    isAdding: false,
  },
]
const SHOWN_STATES: ReadonlySet<string> = new Set([EditingState.Editable, EditingState.Applying])

// What can be done to the rows of a result that can be edited: preview or revert the changes, add,
// duplicate and delete rows, and change cells. Each acts on the selection unless it adds a row or
// takes every change.
export const EditTools = ({ tab, hasSelection, actions }: EditToolsProps): ReactElement | null => {
  const { editing } = tab
  if (!SHOWN_STATES.has(editing.state)) {
    return null
  }
  const isApplying = editing.state === EditingState.Applying
  const isEnabled = (spec: EditSpec): boolean =>
    !isApplying &&
    (!spec.isOnSelection || hasSelection) &&
    (!spec.isAdding || editing.insertProblem === '')
  const groups = { isEnabled, actions, insertProblem: editing.insertProblem }
  return (
    <>
      <ChangeTools editing={editing} actions={actions} />
      <EditGroup label="Rows" specs={ROW_EDITS} {...groups} />
      <EditGroup label="Cells" specs={CELL_EDITS} {...groups} />
    </>
  )
}

// Every change goes back, or the statements that apply them show for the user to confirm.
const ChangeTools = ({
  editing,
  actions,
}: {
  readonly editing: TabEditing
  readonly actions: EditActions
}): ReactElement => {
  const hasChanges = editing.rows.length + editing.newRows.length + editing.hiddenRows > 0
  const isDisabled = editing.state === EditingState.Applying || !hasChanges
  return (
    <ToolGroup label="Changes">
      <ToolButton
        icon={IconName.Save}
        label="Preview Changes…"
        tooltip="Preview the statements of the changes, then apply them (Ctrl+S)"
        isDisabled={isDisabled}
        onClick={actions.preview}
      />
      <ToolButton
        icon={IconName.ClearAll}
        label="Revert All"
        tooltip="Revert every change"
        isDisabled={isDisabled}
        onClick={() => {
          actions.onResult(EditKind.RevertAll)
        }}
      />
    </ToolGroup>
  )
}

interface EditGroupProps {
  readonly label: string
  readonly specs: readonly EditSpec[]
  readonly isEnabled: (spec: EditSpec) => boolean
  readonly actions: EditActions
  // Why rows cannot be added: the tooltip of the buttons that add them.
  readonly insertProblem: string
}

const EditGroup = ({
  label,
  specs,
  isEnabled,
  actions,
  insertProblem,
}: EditGroupProps): ReactElement => (
  <ToolGroup label={label}>
    {specs.map((spec) => (
      <ToolButton
        key={spec.kind}
        icon={spec.icon}
        label={spec.label}
        tooltip={spec.isAdding && insertProblem !== '' ? insertProblem : spec.tooltip}
        isDisabled={!isEnabled(spec)}
        onClick={() => {
          if (spec.isOnSelection) {
            actions.onSelection(spec.kind)
            return
          }
          actions.onResult(spec.kind)
        }}
      />
    ))}
  </ToolGroup>
)
