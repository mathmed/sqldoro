import type { ReactElement } from 'react'

import { EditKind } from '../core/edits/edit-kind.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { EditingState, type TabEditing } from '../core/results/tab-editing.ts'
import type { EditActions } from './edit-messages.ts'
import { IconName } from './icons.tsx'
import { ToolButton, ToolGroup } from './tool-buttons.tsx'
import { toolLabel, ToolName, ToolNote, toolTooltip } from './tool-labels.ts'

interface EditToolsProps {
  readonly tab: ResultTab
  readonly hasSelection: boolean
  readonly actions: EditActions
}

interface EditSpec {
  readonly name: ToolName
  readonly icon: IconName
  readonly kind: EditKind
  readonly isOnSelection: boolean
  readonly isAdding: boolean
}

const ROW_EDITS: readonly EditSpec[] = [
  {
    name: ToolName.AddRow,
    icon: IconName.Add,
    kind: EditKind.Insert,
    isOnSelection: false,
    isAdding: true,
  },
  {
    name: ToolName.DuplicateRows,
    icon: IconName.Duplicate,
    kind: EditKind.Duplicate,
    isOnSelection: true,
    isAdding: true,
  },
  {
    name: ToolName.DeleteRows,
    icon: IconName.Trash,
    kind: EditKind.Delete,
    isOnSelection: true,
    isAdding: false,
  },
]
const CELL_EDITS: readonly EditSpec[] = [
  {
    name: ToolName.SetNull,
    icon: IconName.SetNull,
    kind: EditKind.SetNull,
    isOnSelection: true,
    isAdding: false,
  },
  {
    name: ToolName.SetDefault,
    icon: IconName.SetDefault,
    kind: EditKind.SetDefault,
    isOnSelection: true,
    isAdding: false,
  },
  {
    name: ToolName.RevertCells,
    icon: IconName.Discard,
    kind: EditKind.Revert,
    isOnSelection: true,
    isAdding: false,
  },
]
const SHOWN_STATES: ReadonlySet<string> = new Set([
  EditingState.Editable,
  EditingState.Applying,
  EditingState.ReadOnly,
])

// While the rows cannot change, every tool is off.
const IDLE_STATES: ReadonlySet<string> = new Set([EditingState.Applying, EditingState.ReadOnly])

// Why a button is off, in the order a user should hear it: the first reason that holds.
type Reasons = readonly (readonly [boolean, string])[]

// What can be done to the rows of a result that can be edited: preview or revert the changes, add,
// duplicate and delete rows, and change cells. Each acts on the selection unless it adds a row or
// takes every change. Rows that cannot be edited show the tools off, saying why.
export const EditTools = ({ tab, hasSelection, actions }: EditToolsProps): ReactElement | null => {
  const { editing } = tab
  if (!SHOWN_STATES.has(editing.state)) {
    return null
  }
  const offReason = (spec: EditSpec, selectionNote: string): string =>
    firstReason([
      ...idleReasons(editing),
      [spec.isOnSelection && !hasSelection, selectionNote],
      [spec.isAdding, editing.insertProblem],
    ])
  return (
    <>
      <ChangeTools editing={editing} actions={actions} />
      <EditGroup
        label="Rows"
        specs={ROW_EDITS}
        offReason={(spec) => offReason(spec, ToolNote.NoSelectedRows)}
        actions={actions}
      />
      <EditGroup
        label="Cells"
        specs={CELL_EDITS}
        offReason={(spec) => offReason(spec, ToolNote.NoSelectedCells)}
        actions={actions}
      />
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
  const reason = firstReason([...idleReasons(editing), [!hasChanges, ToolNote.NoChanges]])
  return (
    <ToolGroup label="Changes">
      <ToolButton
        icon={IconName.Save}
        label={toolLabel(ToolName.PreviewChanges)}
        tooltip={toolTooltip(ToolName.PreviewChanges, reason)}
        isDisabled={reason !== ''}
        onClick={actions.preview}
      />
      <ToolButton
        icon={IconName.ClearAll}
        label={toolLabel(ToolName.RevertAll)}
        tooltip={toolTooltip(ToolName.RevertAll, reason)}
        isDisabled={reason !== ''}
        onClick={() => {
          actions.onResult(EditKind.RevertAll)
        }}
      />
    </ToolGroup>
  )
}

// Read-only rows say why; while the changes apply, nothing else can change.
function idleReasons(editing: TabEditing): Reasons {
  return [
    [editing.state === EditingState.ReadOnly, `read-only: ${editing.problem}`],
    [IDLE_STATES.has(editing.state), ToolNote.Applying],
  ]
}

// Empty when no reason holds: the button is on.
function firstReason(reasons: Reasons): string {
  return reasons.find(([isOff, reason]) => isOff && reason !== '')?.[1] ?? ''
}

interface EditGroupProps {
  readonly label: string
  readonly specs: readonly EditSpec[]
  // Why the button of an edit is off; empty when it is on.
  readonly offReason: (spec: EditSpec) => string
  readonly actions: EditActions
}

const EditGroup = ({ label, specs, offReason, actions }: EditGroupProps): ReactElement => (
  <ToolGroup label={label}>
    {specs.map((spec) => (
      <ToolButton
        key={spec.kind}
        icon={spec.icon}
        label={toolLabel(spec.name)}
        tooltip={toolTooltip(spec.name, offReason(spec))}
        isDisabled={offReason(spec) !== ''}
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
