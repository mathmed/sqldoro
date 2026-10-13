// What the buttons of the result toolbar are called: their tooltip, and what screen readers call
// them. The shortcut of a button is the key of the grid that does the same (grid-keys.ts).
export const ToolName = {
  Refresh: 'Refresh',
  CancelQuery: 'Cancel Query',
  PreviewChanges: 'Preview Changes…',
  RevertAll: 'Revert All Changes',
  AddRow: 'Add Row',
  DuplicateRows: 'Duplicate Rows',
  DeleteRows: 'Delete Rows',
  SetNull: 'Set to NULL',
  SetDefault: 'Set to Default',
  RevertCells: 'Revert Cells',
  CopySelection: 'Copy Selection',
  ExportResult: 'Export Result',
  ChooseColumns: 'Choose Columns',
  ShowReferences: 'Show References',
  LoadAllRows: 'Load All Rows',
  ServerSide: 'Sort and Filter on the Server',
  MoreActions: 'More Actions',
  ClearWhere: 'Clear the WHERE condition',
  EditQuery: 'Edit the Query',
} as const

export type ToolName = (typeof ToolName)[keyof typeof ToolName]

// What a tooltip adds to the name of a button: what it takes, or why it is off.
export const ToolNote = {
  Shown: 'the columns shown, in their order',
  NoSelection: 'select cells to copy them',
  NoColumns: 'the result has no columns yet',
  Running: 'the query is still running',
  LoadAll: 'run the query again without the automatic limit',
  NoChanges: 'there are no changes',
  NoSelectedRows: 'select rows first',
  NoSelectedCells: 'select cells first',
  NoRow: 'select a row to see the rows of other tables that reference it',
  Applying: 'the changes are being applied',
  ReadAll: 'read every row again',
  WholeQuery: 'the whole query of this table, above the rows',
} as const

export type ToolNote = (typeof ToolNote)[keyof typeof ToolNote]

const SHORTCUTS: ReadonlyMap<ToolName, string> = new Map([
  [ToolName.PreviewChanges, 'Ctrl+S'],
  [ToolName.DeleteRows, 'Delete'],
  [ToolName.EditQuery, 'Ctrl+Shift+E'],
])

const TOGGLE_ON = 'on'
const TOGGLE_OFF = 'off'

// The name of a button with its shortcut: its accessible name, and its tooltip.
export function toolLabel(name: ToolName): string {
  const shortcut = SHORTCUTS.get(name)
  return shortcut === undefined ? name : `${name} (${shortcut})`
}

// The tooltip says more than the name when there is more to say: why the button is off, or what
// it is showing.
export function toolTooltip(name: ToolName, detail: string): string {
  const label = toolLabel(name)
  return detail === '' ? label : `${label}: ${detail}`
}

// A toggle says whether it is on.
export function toggleTooltip(name: ToolName, isOn: boolean): string {
  return toolTooltip(name, isOn ? TOGGLE_ON : TOGGLE_OFF)
}
