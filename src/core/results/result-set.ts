import type { RowSource } from '../edits/edit-targets.ts'
import { TabEditor } from '../edits/tab-editor.ts'
import type { CellValue, QueryValue, ResultColumn, Row } from '../engine/query.ts'
import { type ColumnLayout, DEFAULT_LAYOUT, shownColumns } from '../grid/column-layout.ts'
import {
  type CellBlock,
  type ResultTab,
  type TabError,
  TabKind,
  TabProgress,
  TabStatus,
  type TabSummary,
  type WireRow,
} from './protocol.ts'
import { NO_META, type ResultMeta } from './result-meta.ts'
import {
  type DistinctValues,
  distinctValues,
  type ProjectedRows,
  projectRows,
} from './result-rows.ts'
import { tabTitle } from './tabs.ts'
import { applyView, IDENTITY_VIEW, isIdentityView, searchRows, type ViewSpec } from './view.ts'
import { toWireRow, toWireValue } from './wire.ts'

export interface ResultSetSpec {
  readonly id: string
  readonly sql: string
  // The values bound to the statement, in the order of its placeholders.
  readonly values: readonly QueryValue[]
  readonly kind: TabKind
  // Whether the statement can run again to sort and filter on the server.
  readonly canServerView: boolean
  // Whether the view offers to read the rows again (the rows of a table opened from the explorer).
  readonly canRefresh: boolean
}

// What a statement read with: its text, its bound values and the WHERE the user typed for it.
export interface Reading {
  readonly sql: string
  readonly values: readonly QueryValue[]
  readonly condition: string
}

// The tooltip of a tab shows the statement up to this many characters.
const MAX_TAB_SQL = 2000

// The rows of one statement, held by the extension host while the webview shows a window of them,
// the view (filters and sort) and the quick search they are shown through, the columns the grid
// shows, what the catalog says of them, and the changes the grid makes to them.
export class ResultSet implements RowSource {
  readonly editor = new TabEditor()
  readonly #spec: ResultSetSpec
  #reading: Reading
  #search = ''
  #status: TabStatus = TabStatus.Running
  #isWaiting = false
  #isDescribed = false
  #columns: readonly ResultColumn[] = []
  #meta: ResultMeta = NO_META
  #layout: ColumnLayout = DEFAULT_LAYOUT
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
    this.#reading = { sql: spec.sql, values: spec.values, condition: '' }
  }

  get id(): string {
    return this.#spec.id
  }

  get sql(): string {
    return this.#reading.sql
  }

  get values(): readonly QueryValue[] {
    return this.#reading.values
  }

  // The condition the rows of a table are read with, as typed; empty without one.
  get tableFilter(): string {
    return this.#reading.condition
  }

  get searchText(): string {
    return this.#search
  }

  get columns(): readonly ResultColumn[] {
    return this.#columns
  }

  get meta(): ResultMeta {
    return this.#meta
  }

  get parameterTypes(): ReadonlyMap<string, string> {
    return this.#meta.parameterTypes
  }

  get layout(): ColumnLayout {
    return this.#layout
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

  // The session of the rows is opening: the view says so until the statement runs.
  waitForSession(): void {
    this.#isWaiting = true
  }

  // Other columns than before: what the catalog said of the old ones no longer holds.
  describe(columns: readonly ResultColumn[]): void {
    if (JSON.stringify(columns) !== JSON.stringify(this.#columns)) {
      this.#meta = NO_META
    }
    this.#columns = columns
    this.#isDescribed = true
  }

  describeMeta(meta: ResultMeta): void {
    this.#meta = meta
  }

  setLayout(layout: ColumnLayout): void {
    this.#layout = layout
  }

  addRows(rows: readonly Row[]): void {
    this.#rows.push(...rows)
  }

  // The rows read with another statement (a table with another WHERE, key or view): the same tab,
  // another query, which the run that reads the rows again runs.
  readWith(reading: Reading): void {
    this.#reading = reading
  }

  // A run again on the server brings rows already sorted and filtered by the view; the changes made
  // to the old rows go with them. The quick search applies again once the rows are all here.
  restart(view: ViewSpec): void {
    this.editor.reset()
    this.#status = TabStatus.Running
    this.#isWaiting = false
    this.#isDescribed = false
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

  // The row a position of the view shows, whole, as the query returned it.
  viewRow(position: number): Row | undefined {
    const index = this.sourceIndex(position)
    return index === undefined ? undefined : this.sourceRow(index)
  }

  window(start: number, count: number, maxCellLength: number): WireRow[] {
    return this.rows(start, count).map((row) => toWireRow(row, maxCellLength))
  }

  cell(viewRow: number, column: number): CellValue {
    return toWireValue(this.rows(viewRow, 1).at(0)?.at(column) ?? null)
  }

  // The cells of a block, with the columns they belong to, in the order the grid shows them.
  project(block: CellBlock): ProjectedRows {
    const rows = this.rows(block.firstRow, block.lastRow - block.firstRow + 1)
    return projectRows(this.#columns, { rows, positions: block.columns })
  }

  // The columns the grid shows, in its order: what an export writes.
  get shownColumns(): number[] {
    return shownColumns(this.#columns, this.#layout)
  }

  // The values a column holds in the rows here, for its filter to offer.
  distinct(column: number, max: number): DistinctValues {
    return distinctValues(this.#rows, column, max)
  }

  toTab(): ResultTab {
    return {
      id: this.#spec.id,
      title: tabTitle(this.sql),
      sql: this.sql.slice(0, MAX_TAB_SQL),
      kind: this.#spec.kind,
      status: this.#status,
      progress: this.#progress(),
      // Where the columns come from stays here: the view only shows them.
      columns: this.#columns.map(({ name, dataType, kind }) => ({ name, dataType, kind })),
      meta: this.#meta.columns,
      references: this.#meta.referenceLabels.map((label) => ({ label })),
      layout: this.#layout,
      rowCount: this.rowCount,
      loadedRows: this.#rows.length,
      view: this.#view,
      viewVersion: this.#viewVersion,
      isServerView: this.#isServerView,
      canServerView: this.#spec.canServerView && this.#spec.kind === TabKind.Rows,
      canRefresh: this.#spec.canRefresh,
      tableFilter: this.tableFilter,
      search: this.#search,
      summary: this.#summary,
      error: this.#error,
      notice: this.#notice,
      plan: this.#plan,
      editing: this.editor.toWire(this),
    }
  }

  #progress(): TabProgress {
    if (!this.isRunning) {
      return TabProgress.Done
    }
    if (this.#isWaiting) {
      return TabProgress.Connecting
    }
    return this.#isDescribed ? TabProgress.Fetching : TabProgress.Running
  }
}
