import type { Row } from '../engine/query.ts'
import { ValueType } from '../engine/table.ts'
import { plural } from '../results/tabs.ts'
import type { EditableColumn, EditableTable } from './editability.ts'
import {
  changedRowCount,
  type NewRow,
  type PendingEdits,
  PendingKind,
  type PendingValue,
  type RowChange,
} from './pending.ts'
import {
  deleteStatement,
  type EditStatement,
  EditVerb,
  insertStatement,
  type StatementDialect,
  updateStatement,
} from './statements.ts'

export interface PlanContext {
  readonly table: EditableTable
  readonly dialect: StatementDialect
  readonly original: (index: number) => Row | undefined
}

export interface EditPlan {
  // The table, as people read it.
  readonly table: string
  // Deletions first (they free unique values), then updates, then insertions.
  readonly statements: readonly EditStatement[]
  readonly deletions: number
  // What the plan does, for people: 1 update, 2 insertions and 1 deletion on sales.orders.
  readonly summary: string
}

export type PlanReading = { readonly plan: EditPlan } | { readonly problem: string }

interface Existing {
  readonly index: number
  readonly original: Row
  readonly change: RowChange
}

const NOTHING = 'There are no changes to apply.'
const GONE = 'A changed row is no longer in the result: revert its changes.'
const WORDS: readonly (readonly [EditVerb, string, string])[] = [
  [EditVerb.Update, 'update', 'updates'],
  [EditVerb.Insert, 'insertion', 'insertions'],
  [EditVerb.Delete, 'deletion', 'deletions'],
]

export function planEdits(edits: PendingEdits, context: PlanContext): PlanReading {
  if (changedRowCount(edits) === 0) {
    return { problem: NOTHING }
  }
  const rows = existingRows(edits, context)
  if (rows === undefined) {
    return { problem: GONE }
  }
  const problem = newRowsProblem(edits.newRows, context.table)
  return problem === undefined ? { plan: planOf(rows, edits.newRows, context) } : { problem }
}

// The changed rows of the result, in order, with what the query returned for them; undefined when
// one is no longer there.
function existingRows(edits: PendingEdits, context: PlanContext): Existing[] | undefined {
  const rows: Existing[] = []
  for (const [index, change] of [...edits.rows].sort(([left], [right]) => left - right)) {
    const original = context.original(index)
    if (original === undefined) {
      return undefined
    }
    rows.push({ index, original, change })
  }
  return rows
}

function newRowsProblem(rows: readonly NewRow[], table: EditableTable): string | undefined {
  return rows
    .map((row, index) => missingValues(row, table, index + 1))
    .find((problem) => problem !== undefined)
}

// A column without a default that the grid can set needs a value in a new row.
function missingValues(row: NewRow, table: EditableTable, position: number): string | undefined {
  const names = table.columns
    .filter((column, index) => needsValue(column) && !isGiven(row.cells.get(index)))
    .map(({ name }) => name)
  return names.length === 0
    ? undefined
    : `New row ${String(position)} needs a value for ${names.join(', ')}.`
}

function needsValue(column: EditableColumn): boolean {
  return column.value.type !== ValueType.ReadOnly && !column.hasDefault
}

function isGiven(value: PendingValue | undefined): boolean {
  return value?.kind === PendingKind.Text
}

function planOf(
  rows: readonly Existing[],
  newRows: readonly NewRow[],
  context: PlanContext,
): EditPlan {
  const target = { dialect: context.dialect, table: context.table }
  const deleted = rows.filter(({ change }) => change.isDeleted)
  const updated = rows.filter(({ change }) => !change.isDeleted)
  const statements = [
    ...deleted.map((row) => deleteStatement(target, row)),
    ...updated.map((row) => updateStatement(target, { ...row, cells: row.change.cells })),
    ...newRows.map((row, index) => insertStatement(target, { ...row, position: index + 1 })),
  ]
  return {
    table: context.table.label,
    statements,
    deletions: deleted.length,
    summary: `${summaryOf(statements)} on ${context.table.label}`,
  }
}

function summaryOf(statements: readonly EditStatement[]): string {
  const parts = WORDS.flatMap(([verb, one, many]) => {
    const count = statements.filter((statement) => statement.verb === verb).length
    return count === 0 ? [] : [plural(count, one, many)]
  })
  return listText(parts)
}

// a, a and b, a, b and c.
function listText(parts: readonly string[]): string {
  const last = parts.length - 1
  return parts.map((part, index) => `${separatorBefore(index, last)}${part}`).join('')
}

function separatorBefore(index: number, last: number): string {
  if (index === 0) {
    return ''
  }
  return index === last ? ' and ' : ', '
}
