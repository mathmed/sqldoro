import type { EditPlan } from '../../core/edits/plan.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import type { ExportFormat } from '../../core/results/export-format.ts'
import type { CellBlock, NavigationStart } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { PeekView } from '../../core/results/tab-meta.ts'
import type { ViewSpec } from '../../core/results/view.ts'

export interface CopyRequest {
  readonly block: CellBlock
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
  // Keeps the columns a table panel shows for its table, for the next time.
  readonly saveLayout: (tab: ResultSet) => Promise<void>
  // Opens the row the foreign key of a cell points at.
  readonly navigate: (tab: ResultSet, request: LinkRequest) => Promise<void>
  // Opens the rows of a referencing table that reference a row.
  readonly openReference: (tab: ResultSet, request: ReferenceRequest) => Promise<void>
  // How many rows of each referencing table reference a row, through the guards; undefined when
  // nothing ran.
  readonly countReferences: (
    tab: ResultSet,
    row: number,
  ) => Promise<readonly (string | null)[] | undefined>
  // A few columns of the row the foreign key of a cell points at.
  readonly peek: (
    tab: ResultSet,
    cell: { readonly row: number; readonly column: number },
  ) => Promise<PeekView>
  // Shows a step of the trail of a table panel again.
  readonly goToStep: (step: number) => Promise<void>
  // Asks to allow writes on the connection of the panel.
  readonly allowWrites: () => Promise<void>
  // Opens the statement of a table panel in an SQL editor.
  readonly openInEditor: (tab: ResultSet) => Promise<void>
}

interface LinkRequest {
  readonly start: NavigationStart
  readonly column: number
}

interface ReferenceRequest {
  readonly start: NavigationStart
  readonly reference: number
}
