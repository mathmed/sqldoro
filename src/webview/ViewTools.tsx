import type { ReactElement } from 'react'

import { type ResultTab, TabKind, TabStatus } from '../core/results/protocol.ts'
import { Icon, IconName } from './icons.tsx'
import { ToolGroup } from './tool-buttons.tsx'
import { toolLabel, ToolName, ToolNote, toolTooltip } from './tool-labels.ts'
import type { WhereSql } from './where-source.ts'

// What the toolbar opens over the grid, under the button that opens it.
export interface ToolbarPanels {
  readonly openColumns: (anchor: HTMLElement) => void
  // The rows that reference the selected row; undefined without a row selected.
  readonly openReferences: ((anchor: HTMLElement) => void) | undefined
  // How many columns the grid hides.
  readonly hiddenColumns: number
  readonly whereSql: WhereSql
}

// Which columns the grid shows, and the rows of other tables that reference the selected row.
export const ViewTools = ({
  tab,
  panels,
}: {
  readonly tab: ResultTab
  readonly panels: ToolbarPanels
}): ReactElement | null => {
  if (tab.kind !== TabKind.Rows || tab.status === TabStatus.Failed) {
    return null
  }
  return (
    <ToolGroup label="View">
      <PanelButton
        icon={IconName.Columns}
        label={toolLabel(ToolName.ChooseColumns)}
        tooltip={columnsTooltip(panels.hiddenColumns)}
        onOpen={panels.openColumns}
      />
      {tab.references.length === 0 ? null : (
        <PanelButton
          icon={IconName.References}
          label={toolLabel(ToolName.ShowReferences)}
          tooltip={referencesTooltip(panels.openReferences !== undefined)}
          onOpen={panels.openReferences}
        />
      )}
    </ToolGroup>
  )
}

function columnsTooltip(hidden: number): string {
  return toolTooltip(ToolName.ChooseColumns, hidden === 0 ? '' : `${String(hidden)} hidden`)
}

function referencesTooltip(hasRow: boolean): string {
  return toolTooltip(ToolName.ShowReferences, hasRow ? '' : ToolNote.NoRow)
}

interface PanelButtonProps {
  readonly icon: IconName
  readonly label: string
  readonly tooltip: string
  // Undefined while there is nothing to open.
  readonly onOpen: ((anchor: HTMLElement) => void) | undefined
}

const PanelButton = ({ icon, label, tooltip, onOpen }: PanelButtonProps): ReactElement => (
  <button
    type="button"
    className="tool-button"
    aria-label={label}
    aria-haspopup="dialog"
    title={tooltip}
    aria-disabled={onOpen === undefined}
    onClick={(event) => {
      onOpen?.(event.currentTarget)
    }}
  >
    <Icon name={icon} />
  </button>
)
