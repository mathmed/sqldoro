import type { EditMessage } from '../results/protocol.ts'
import { EditingState, type TabEditing } from '../results/tab-editing.ts'
import { applyEdit } from './edit-actions.ts'
import { editTargets, type RowSource } from './edit-targets.ts'
import { pendingView, previewOf, type PreviewParts } from './edit-wire.ts'
import type { Editability, EditableTable } from './editability.ts'
import {
  changedRowCount,
  NO_EDITS,
  type PendingEdits,
  revertAll,
  type RowTarget,
} from './pending.ts'
import { type EditPlan, planEdits } from './plan.ts'
import type { StatementDialect } from './statements.ts'

// What an apply did: every change applied (the changes start afresh), or none, with what kept each
// row out.
export interface ApplyReport {
  readonly isApplied: boolean
  readonly message: string
  readonly problems: readonly { readonly row: RowTarget; readonly problem: string }[]
}

export interface PreviewSetting {
  readonly dialect: StatementDialect
  readonly isInOpenTransaction: boolean
}

export const NOT_EDITING: TabEditing = {
  state: EditingState.None,
  problem: '',
  table: '',
  key: [],
  columns: [],
  insertProblem: '',
  rows: [],
  newRows: [],
  hiddenRows: 0,
  preview: null,
  notice: '',
  isNoticeError: false,
}

// The editing of the rows of a tab, in the extension host: whether they can be edited, the changes
// waiting to be applied, the preview of their statements and what the last edit or apply said.
// Changes only ever reach the server through a preview the user applies.
// Whether the rows can be edited: not yet known (no rows to edit, or a check running), not (and
// why), or how, with an apply running or not.
type Mode =
  | { readonly state: typeof EditingState.Checking | typeof EditingState.None }
  | { readonly state: typeof EditingState.ReadOnly; readonly problem: string }
  | {
      readonly state: typeof EditingState.Applying | typeof EditingState.Editable
      readonly table: EditableTable
    }

export class TabEditor {
  #mode: Mode = { state: EditingState.None }
  #edits: PendingEdits = NO_EDITS
  #check = 0
  #previews = 0
  #preview: PreviewParts | undefined
  #notice = ''
  #isNoticeError = false
  #rowProblems: ReadonlyMap<string, string> = new Map()

  get hasChanges(): boolean {
    return changedRowCount(this.#edits) > 0
  }

  // The rows changed (another run, or the same one again): the changes of the old rows go.
  reset(): void {
    this.#mode = { state: EditingState.None }
    this.#edits = revertAll(this.#edits)
    this.#preview = undefined
    this.#rowProblems = new Map()
    this.notify('', false)
    this.#check += 1
  }

  // A check of whether the rows can be edited starts; it counts if it ends before the rows change.
  startCheck(): number {
    this.#mode = { state: EditingState.Checking }
    this.#check += 1
    return this.#check
  }

  finishCheck(check: number, editability: Editability): boolean {
    if (check !== this.#check || this.#mode.state !== EditingState.Checking) {
      return false
    }
    this.#mode =
      'table' in editability
        ? { state: EditingState.Editable, table: editability.table }
        : { state: EditingState.ReadOnly, problem: editability.problem }
    return true
  }

  // False when the rows cannot be edited now: the edit is dropped.
  act(edit: EditMessage, rows: RowSource): boolean {
    const table = this.#editable()
    if (table === undefined) {
      return false
    }
    const source = { rows, edits: this.#edits, columnCount: table.columns.length }
    const targets = editTargets(edit, source)
    const outcome =
      'problem' in targets
        ? { edits: this.#edits, problem: targets.problem }
        : applyEdit(
            this.#edits,
            { ...edit, cells: targets.cells },
            { table, original: rows.sourceRow },
          )
    this.#edits = outcome.edits
    this.#preview = undefined
    this.notify(outcome.problem, outcome.problem !== '')
    return true
  }

  preview(rows: RowSource, setting: PreviewSetting): boolean {
    const table = this.#editable()
    if (table === undefined) {
      return false
    }
    const reading = planEdits(this.#edits, {
      table,
      dialect: setting.dialect,
      original: rows.sourceRow,
    })
    if ('problem' in reading) {
      this.#preview = undefined
      this.notify(reading.problem, true)
      return true
    }
    this.#previews += 1
    this.#preview = {
      id: this.#previews,
      plan: reading.plan,
      isInOpenTransaction: setting.isInOpenTransaction,
    }
    this.notify('', false)
    return true
  }

  closePreview(): void {
    this.#preview = undefined
  }

  // The plan of the preview the user applies, once: then the changes wait for its outcome.
  // A preview only exists while the rows can be edited: editing again or reading the rows again
  // drops it.
  take(previewId: number): EditPlan | undefined {
    const preview = this.#preview
    const table = this.#editable()
    if (preview?.id !== previewId || table === undefined) {
      return undefined
    }
    this.#preview = undefined
    this.#mode = { state: EditingState.Applying, table }
    return preview.plan
  }

  finish(report: ApplyReport): void {
    if (this.#mode.state !== EditingState.Applying) {
      return
    }
    this.#mode = { state: EditingState.Editable, table: this.#mode.table }
    this.#rowProblems = new Map(
      report.problems.map(({ row, problem }) => [JSON.stringify(row), problem]),
    )
    if (report.isApplied) {
      this.#edits = revertAll(this.#edits)
    }
    this.notify(report.message, !report.isApplied)
  }

  notify(notice: string, isError: boolean): void {
    this.#notice = notice
    this.#isNoticeError = isError
  }

  toWire(rows: RowSource): TabEditing {
    const mode = this.#mode
    if (mode.state === EditingState.None) {
      return NOT_EDITING
    }
    const notice = { notice: this.#notice, isNoticeError: this.#isNoticeError }
    if (!('table' in mode)) {
      return { ...NOT_EDITING, ...mode, ...notice }
    }
    const { table } = mode
    return {
      ...NOT_EDITING,
      state: mode.state,
      table: table.label,
      key: table.key.flatMap((index) =>
        table.columns.slice(index, index + 1).map(({ name }) => name),
      ),
      columns: table.columns.map(({ value }) => value),
      insertProblem: table.insertProblem,
      ...pendingView(this.#edits, rows, (row) => this.#rowProblems.get(JSON.stringify(row)) ?? ''),
      preview: this.#preview === undefined ? null : previewOf(this.#preview),
      ...notice,
    }
  }

  #editable(): EditableTable | undefined {
    return this.#mode.state === EditingState.Editable ? this.#mode.table : undefined
  }
}
