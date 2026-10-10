import type {
  EditPreview,
  NewRowView,
  PendingCell,
  PendingRow,
  PreviewStatement,
} from '../results/protocol.ts'
import { groupDigits } from '../results/tabs.ts'
import type { RowSource } from './edit-targets.ts'
import type { PendingEdits, PendingValue, RowTarget } from './pending.ts'
import type { EditPlan } from './plan.ts'
import type { EditStatement } from './statements.ts'

export interface PendingView {
  readonly rows: readonly PendingRow[]
  readonly newRows: readonly NewRowView[]
  readonly hiddenRows: number
}

// Values longer than this are cut in the preview.
const MAX_SHOWN_VALUE = 200
const QUOTE = "'"

// The changes as the view shows them: rows of the result by their position in the view (rows its
// filters hide are counted apart), new rows in order; each with what kept it out of the last apply.
export function pendingView(
  edits: PendingEdits,
  rows: RowSource,
  problemOf: (row: RowTarget) => string,
): PendingView {
  // Finding where the view shows rows reads the whole view: only done when there are some.
  const positions =
    edits.rows.size === 0 ? new Map<number, number>() : rows.viewPositions([...edits.rows.keys()])
  const shown = [...edits.rows].flatMap(([index, change]) => {
    const position = positions.get(index)
    return position === undefined ? [] : [{ index, change, position }]
  })
  return {
    rows: shown
      .toSorted((left, right) => left.position - right.position)
      .map(({ index, change, position }) => ({
        row: position,
        isDeleted: change.isDeleted,
        cells: cellsOf(change.cells),
        problem: problemOf({ isNew: false, index }),
      })),
    newRows: edits.newRows.map(({ id, cells }) => ({
      id,
      cells: cellsOf(cells),
      problem: problemOf({ isNew: true, id }),
    })),
    hiddenRows: edits.rows.size - shown.length,
  }
}

function cellsOf(cells: ReadonlyMap<number, PendingValue>): PendingCell[] {
  return [...cells]
    .sort(([left], [right]) => left - right)
    .map(([column, value]) => ({ column, value }))
}

export interface PreviewParts {
  readonly id: number
  readonly plan: EditPlan
  readonly isInOpenTransaction: boolean
}

export function previewOf({ id, plan, isInOpenTransaction }: PreviewParts): EditPreview {
  return {
    id,
    summary: plan.summary,
    statements: plan.statements.map(previewStatement),
    deletions: plan.deletions,
    isInOpenTransaction,
  }
}

function previewStatement(statement: EditStatement): PreviewStatement {
  return {
    sql: statement.sql,
    values: statement.values.map(shownValue),
    expectedRows: statement.expectedRows,
    label: statement.label,
  }
}

// A bound value as people read it: text between quotes, cut when it is long.
export function shownValue(value: string): string {
  const quoted = value.slice(0, MAX_SHOWN_VALUE).replaceAll(QUOTE, QUOTE + QUOTE)
  return value.length > MAX_SHOWN_VALUE
    ? `${QUOTE}${quoted}…${QUOTE} (${groupDigits(value.length)} characters)`
    : `${QUOTE}${quoted}${QUOTE}`
}
