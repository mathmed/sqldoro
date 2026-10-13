import type { ReactElement } from 'react'

import { ExportFormat } from '../core/results/export-format.ts'
import { type ResultTab, TabStatus } from '../core/results/protocol.ts'
import { canLoadAll } from '../core/results/tabs.ts'
import type { EditActions } from './edit-messages.ts'
import { EditTools } from './EditTools.tsx'
import { IconName } from './icons.tsx'
import { MenuButton, type MenuItem } from './Menu.tsx'
import { QuickSearch } from './QuickSearch.tsx'
import { ToolButton, ToolGroup, ToolToggle } from './tool-buttons.tsx'
import { toggleTooltip, toolLabel, ToolName, ToolNote, toolTooltip } from './tool-labels.ts'
import type { QueryModeSwitch } from './view-context.ts'
import { type ToolbarPanels, ViewTools } from './ViewTools.tsx'
import { WhereEditor } from './WhereEditor.tsx'

export interface ToolbarActions {
  readonly cancel: () => void
  readonly loadAll: () => void
  // Reads the rows of a table opened from the explorer again.
  readonly refresh: () => void
  readonly copy: (format: ExportFormat) => void
  // The selected rows, whole, as INSERT statements.
  readonly copyRows: () => void
  readonly export: (format: ExportFormat) => void
  readonly setServerSide: (isServerSide: boolean) => void
  // The quick search of the rows, in the host.
  readonly search: (text: string) => void
  // Reads the rows of a table again with a condition as their WHERE.
  readonly filterTable: (condition: string) => void
  // Opens the statement of the rows of a table panel in a new SQL editor.
  readonly openInEditor: () => void
}

interface ToolbarProps {
  readonly tab: ResultTab
  readonly hasSelection: boolean
  readonly isServerSide: boolean
  readonly actions: ToolbarActions
  readonly edits: EditActions
  readonly panels: ToolbarPanels
  readonly queryMode: QueryModeSwitch
}

interface ToolsProps {
  readonly tab: ResultTab
  readonly actions: ToolbarActions
}

const COPY_FORMATS: readonly (readonly [ExportFormat, string])[] = [
  [ExportFormat.Csv, 'Copy as CSV'],
  [ExportFormat.Json, 'Copy as JSON'],
  [ExportFormat.Sql, 'Copy as INSERT'],
]
const EXPORT_FORMATS: readonly (readonly [ExportFormat, string])[] = [
  [ExportFormat.Csv, 'Export as CSV…'],
  [ExportFormat.Json, 'Export as JSON…'],
  [ExportFormat.Sql, 'Export as SQL…'],
]

// The actions of a result, grouped as in VS Code's toolbars: reading the rows again, their changes,
// copying and exporting, how they are read; then the WHERE of a table (unless its query box is
// shown), the quick search, and the other actions of a table panel.
export const Toolbar = (props: ToolbarProps): ReactElement => {
  const { tab, hasSelection, actions, panels, queryMode } = props
  return (
    <div className="toolbar" role="toolbar" aria-label="Result actions">
      <RunTools tab={tab} actions={actions} />
      <EditTools tab={tab} hasSelection={hasSelection} actions={props.edits} />
      <CopyTools tab={tab} hasSelection={hasSelection} actions={actions} />
      <ViewTools tab={tab} panels={panels} />
      <ReadTools tab={tab} isServerSide={props.isServerSide} actions={actions} />
      <span className="toolbar-fill" />
      {tab.canRefresh && !queryMode.isOn ? (
        <WhereEditor
          tab={tab}
          sql={panels.whereSql}
          onFilter={actions.filterTable}
          onEditQuery={queryMode.toggle}
        />
      ) : null}
      <QuickSearch tab={tab} onSearch={actions.search} />
      <MoreTools tab={tab} actions={actions} />
    </div>
  )
}

// What a table panel does less often: its query in a new SQL editor.
const MoreTools = ({ tab, actions }: ToolsProps): ReactElement | null =>
  tab.queryBox === null ? null : (
    <MenuButton
      label={toolLabel(ToolName.MoreActions)}
      tooltip={toolLabel(ToolName.MoreActions)}
      icon={IconName.More}
      items={[{ label: 'Open in SQL Editor', isDisabled: false, onSelect: actions.openInEditor }]}
      isDisabled={false}
      hasChevron={false}
    />
  )

// While the statement runs it can be cancelled; once it ran, the rows of a table can be read again.
const RunTools = ({ tab, actions }: ToolsProps): ReactElement | null => {
  if (tab.status !== TabStatus.Running && !tab.canRefresh) {
    return null
  }
  return (
    <ToolGroup label="Run">
      {tab.status === TabStatus.Running ? (
        <ToolButton
          icon={IconName.Stop}
          label={toolLabel(ToolName.CancelQuery)}
          tooltip={toolLabel(ToolName.CancelQuery)}
          isDisabled={false}
          onClick={actions.cancel}
        />
      ) : (
        <ToolButton
          icon={IconName.Refresh}
          label={toolLabel(ToolName.Refresh)}
          tooltip={toolLabel(ToolName.Refresh)}
          isDisabled={false}
          onClick={actions.refresh}
        />
      )}
    </ToolGroup>
  )
}

// The selection is copied to the clipboard, the whole result exported to a file.
const CopyTools = ({
  tab,
  hasSelection,
  actions,
}: ToolsProps & { readonly hasSelection: boolean }): ReactElement => (
  <ToolGroup label="Copy and export">
    <MenuButton
      label={toolLabel(ToolName.CopySelection)}
      tooltip={toolTooltip(
        ToolName.CopySelection,
        hasSelection ? ToolNote.Shown : ToolNote.NoSelection,
      )}
      icon={IconName.Copy}
      items={[...formatItems(COPY_FORMATS, actions.copy), copyRowsItem(actions)]}
      isDisabled={!hasSelection}
      hasChevron
    />
    <MenuButton
      label={toolLabel(ToolName.ExportResult)}
      tooltip={toolTooltip(ToolName.ExportResult, exportNote(tab))}
      icon={IconName.Export}
      items={formatItems(EXPORT_FORMATS, actions.export)}
      isDisabled={exportNote(tab) !== ToolNote.Shown}
      hasChevron
    />
  </ToolGroup>
)

// What the export takes, or why there is nothing to export yet.
function exportNote(tab: ResultTab): ToolNote {
  if (tab.status === TabStatus.Running) {
    return ToolNote.Running
  }
  return tab.columns.length === 0 ? ToolNote.NoColumns : ToolNote.Shown
}

// INSERT statements that write the selected rows whole, hidden columns too.
function copyRowsItem(actions: ToolbarActions): MenuItem {
  return {
    label: 'Copy Rows as INSERT (every column)',
    isDisabled: false,
    onSelect: actions.copyRows,
  }
}

function formatItems(
  formats: readonly (readonly [ExportFormat, string])[],
  onFormat: (format: ExportFormat) => void,
): MenuItem[] {
  return formats.map(([format, label]) => ({
    label,
    isDisabled: false,
    onSelect: () => {
      onFormat(format)
    },
  }))
}

// How the rows are read: all of them when the automatic limit cut the result, and sorted and
// filtered here (off) or by the server (on), where the statement can run again.
const ReadTools = ({
  tab,
  isServerSide,
  actions,
}: ToolsProps & { readonly isServerSide: boolean }): ReactElement | null => {
  const isLimited = canLoadAll(tab)
  const canToggle = canToggleServer(tab)
  if (!isLimited && !canToggle) {
    return null
  }
  return (
    <ToolGroup label="Reading">
      {isLimited ? <LoadAllButton onClick={actions.loadAll} /> : null}
      {canToggle ? (
        <ToolToggle
          icon={IconName.Server}
          label={toolLabel(ToolName.ServerSide)}
          tooltip={toggleTooltip(ToolName.ServerSide, isServerSide)}
          isOn={isServerSide}
          isDisabled={tab.status === TabStatus.Running}
          onChange={actions.setServerSide}
        />
      ) : null}
    </ToolGroup>
  )
}

// The rows of a table are always sorted and filtered by the server.
function canToggleServer(tab: ResultTab): boolean {
  return tab.canServerView && !tab.canRefresh
}

// The query was cut at the automatic limit: one click runs it again without it.
const LoadAllButton = ({ onClick }: { readonly onClick: () => void }): ReactElement => (
  <ToolButton
    icon={IconName.LoadAll}
    label={toolLabel(ToolName.LoadAllRows)}
    tooltip={toolTooltip(ToolName.LoadAllRows, ToolNote.LoadAll)}
    isDisabled={false}
    onClick={onClick}
  />
)
