import type { RowSource } from '../edits/edit-targets.ts'
import { TabEditor } from '../edits/tab-editor.ts'
import type { CellValue, ResultColumn, Row } from '../engine/query.ts'
import {
  type CellRange,
  type ResultTab,
  type TabError,
  TabKind,
  TabStatus,
  type TabSummary,
  type WireRow,
} from './protocol.ts'
import { tabTitle } from './tabs.ts'
import { applyView, IDENTITY_VIEW, isIdentityView, searchRows, type ViewSpec } from './view.ts'
import { toWireRow, toWireValue } from './wire.ts'

export interface ResultSetSpec {
  readonly id: string
  readonly sql: string
  readonly kind: TabKind
  // Whether the statement can run again to sort and filter on the server.
  readonly canServerView: boolean
  // Whether the view offers to read the rows again (the rows of a table opened from the explorer).
  readonly canRefresh: boolean
}

export interface ProjectedRows {
  readonly columns: readonly ResultColumn[]
  readonly rows: readonly Row[]
}

// The tooltip of a tab shows the statement up to this many characters.
const MAX_TAB_SQL = 2000

// The rows of one statement, held by the extension host while the webview shows a window of them,
// the view (filters and sort) and the quick search they are shown through, and the changes the grid
// makes to them.
export class ResultSet implements RowSource {
  readonly editor = new TabEditor()
  readonly #spec: ResultSetSpec
  #sql: string
  #tableFilter = ''
  #search = ''
  #status: TabStatus = TabStatus.Running
  #columns: readonly ResultColumn[] = []
  #rows: Row[] = []
  #view: ViewSpec = IDENTITY_VIEW
  #order: readonly number[] | undefined
  #viewVersion = 0
  #isServerView = false
  #summary: TabSummary | null = null
  #error: TabError | null = null
  #notice = ''
  #plan: readonly string[] = []

  constructor(spec: ResultSetSpec) {
    this.#spec = spec
    this.#sql = spec.sql
  }

  get id(): string {
    return this.#spec.id
  }

  get sql(): string {
    return this.#sql
  }

  // The condition the rows of a table are read with, as typed; empty without one.
  get tableFilter(): string {
    return this.#tableFilter
  }

  get searchText(): string {
    return this.#search
  }

  get columns(): readonly ResultColumn[] {
    return this.#columns
  }

  get view(): ViewSpec {
    return this.#view
  }

  // Sorted and filtered by the server: running the query again runs the view again.
  get isServerView(): boolean {
    return this.#isServerView
  }

  get viewVersion(): number {
    return this.#viewVersion
  }

  get canRefresh(): boolean {
    return this.#spec.canRefresh
  }

  get isRunning(): boolean {
    return this.#status === TabStatus.Running
  }

  // Rows in the view, after its filters.
  get rowCount(): number {
    return this.#order?.length ?? this.#rows.length
  }

  describe(columns: readonly ResultColumn[]): void {
    this.#columns = columns
  }

  addRows(rows: readonly Row[]): void {
    this.#rows.push(...rows)
  }

  // A table read with another condition (its WHERE): the same tab and view, another query, which the
  // run that reads the rows again runs.
  filterTable(sql: string, condition: string): void {
    this.#sql = sql
    this.#tableFilter = condition
  }

  // A run again on the server brings rows already sorted and filtered by the view; the changes made
  // to the old rows go with them. The quick search applies again once the rows are all here.
  restart(view: ViewSpec): void {
    this.editor.reset()
    this.#status = TabStatus.Running
    this.#rows = []
    this.#order = undefined
    this.#view = view
    this.#isServerView = !isIdentityView(view)
    this.#summary = null
    this.#error = null
    this.#viewVersion += 1
  }

  succeed(summary: TabSummary, plan: readonly string[] = []): void {
    this.#status = TabStatus.Succeeded
    this.#summary = summary
    this.#plan = plan
    this.#searchAgain()
  }

  fail(error: TabError): void {
    this.#status = TabStatus.Failed
    this.#error = error
    this.#searchAgain()
  }

  cancel(durationMs: number): void {
    this.#status = TabStatus.Cancelled
    this.#summary = { durationMs, affectedRows: null, isTruncated: false, autoLimit: null }
    this.#searchAgain()
  }

  // Notices add up: what the transaction did, then what did not run.
  addNotice(notice: string): void {
    this.#notice = this.#notice === '' ? notice : `${this.#notice} ${notice}`
  }

  // Sorting and filtering the rows already here: the server is not asked again.
  applyView(view: ViewSpec): void {
    this.#view = view
    this.#isServerView = false
    this.#reorder()
  }

  // Keeps the rows of the view with the text in any column, here, however the view sorts and
  // filters them (here or on the server); an empty text shows them all again.
  searchFor(text: string): void {
    this.#search = text
    this.#reorder()
  }

  // The rows the view shows, in order: undefined when it shows every row as it came.
  #reorder(): void {
    const isSortedHere = !this.#isServerView && !isIdentityView(this.#view)
    const viewed = isSortedHere ? applyView(this.#rows, this.#columns, this.#view) : undefined
    this.#order = this.#search === '' ? viewed : searchRows(this.#rows, viewed, this.#search)
    this.#viewVersion += 1
  }

  // A run that ends brought new rows: the quick search keeps those with its text.
  #searchAgain(): void {
    if (this.#search !== '') {
      this.#reorder()
    }
  }

  // Rows of the view, from `start`; past the end there are fewer.
  rows(start: number, count: number): Row[] {
    const from = Math.max(start, 0)
    const to = from + Math.max(count, 0)
    return this.#order === undefined
      ? this.#rows.slice(from, to)
      : this.#order.slice(from, to).flatMap((index) => this.#rows.slice(index, index + 1))
  }

  // The position in the result of the row a view position shows.
  readonly sourceIndex = (viewRow: number): number | undefined =>
    viewRow < this.rowCount ? (this.#order?.at(viewRow) ?? viewRow) : undefined

  // Where the view shows rows of the result; the rows its filters hide are left out.
  readonly viewPositions = (indexes: readonly number[]): ReadonlyMap<number, number> => {
    const wanted = new Set(indexes.filter((index) => index < this.#rows.length))
    if (this.#order === undefined) {
      return new Map([...wanted].map((index) => [index, index]))
    }
    const positions = new Map<number, number>()
    this.#order.forEach((index, position) => {
      if (wanted.has(index)) {
        positions.set(index, position)
      }
    })
    return positions
  }

  readonly sourceRow = (index: number): Row | undefined => this.#rows.at(index)

  window(start: number, count: number, maxCellLength: number): WireRow[] {
    return this.rows(start, count).map((row) => toWireRow(row, maxCellLength))
  }

  cell(viewRow: number, column: number): CellValue {
    return toWireValue(this.rows(viewRow, 1).at(0)?.at(column) ?? null)
  }

  // The cells of a range, with the columns they belong to.
  project(range: CellRange): ProjectedRows {
    const first = range.firstColumn
    const end = range.lastColumn + 1
    return {
      columns: this.#columns.slice(first, end),
      rows: this.rows(range.firstRow, range.lastRow - range.firstRow + 1).map((row) =>
        row.slice(first, end),
      ),
    }
  }

  toTab(): ResultTab {
    return {
      id: this.#spec.id,
      title: tabTitle(this.#sql),
      sql: this.#sql.slice(0, MAX_TAB_SQL),
      kind: this.#spec.kind,
      status: this.#status,
      // Where the columns come from stays here: the view only shows them.
      columns: this.#columns.map(({ name, dataType, kind }) => ({ name, dataType, kind })),
      rowCount: this.rowCount,
      loadedRows: this.#rows.length,
      view: this.#view,
      viewVersion: this.#viewVersion,
      isServerView: this.#isServerView,
      canServerView: this.#spec.canServerView && this.#spec.kind === TabKind.Rows,
      canRefresh: this.#spec.canRefresh,
      tableFilter: this.#tableFilter,
      search: this.#search,
      summary: this.#summary,
      error: this.#error,
      notice: this.#notice,
      plan: this.#plan,
      editing: this.editor.toWire(this),
    }
  }
}
