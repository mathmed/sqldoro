import type { EditPlan } from '../../core/edits/plan.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import type { ExportFormat } from '../../core/results/export-format.ts'
import type { CellRange } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { ViewSpec } from '../../core/results/view.ts'

export interface CopyRequest {
  readonly range: CellRange
  readonly format: ExportFormat
}

// What a result panel cannot do on its own: the extension wires these to the runner, the clipboard
// and the file system.
export interface PanelActions {
  readonly cancel: () => void
  readonly serverView: (tab: ResultSet, view: ViewSpec) => Promise<void>
  readonly loadAll: (tab: ResultSet) => Promise<void>
  // Reads the rows of the tab again, in its view, through the guards.
  readonly refresh: (tab: ResultSet) => Promise<void>
  // Reads the rows of a table again with a condition the user typed (its WHERE), through the guards.
  readonly filterTable: (tab: ResultSet, condition: string) => Promise<void>
  readonly copy: (tab: ResultSet, request: CopyRequest, dialect: Dialect) => Promise<void>
  readonly export: (tab: ResultSet, format: ExportFormat, dialect: Dialect) => Promise<void>
  readonly copyColumnName: (tab: ResultSet, column: number) => Promise<void>
  // Runs the statements of the changes of a tab, through the guards; the tab hears how it went.
  readonly applyEdits: (tab: ResultSet, plan: EditPlan) => Promise<void>
  // Whether the changes would join the transaction open in the editor.
  readonly isInOpenTransaction: () => boolean
}
