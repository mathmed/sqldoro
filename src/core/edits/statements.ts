import {
  type Dialect,
  parameterPlaceholder,
  qualifiedName,
  quoteIdentifier,
} from '../engine/dialect.ts'
import type { CellValue, Row } from '../engine/query.ts'
import { ValueType } from '../engine/table.ts'
import type { EditableColumn, EditableTable } from './editability.ts'
import { PendingKind, type PendingValue, type RowTarget } from './pending.ts'

export type StatementDialect = Pick<Dialect, 'identifierQuote' | 'parameterStyle'>

export const EditVerb = {
  Update: 'UPDATE',
  Insert: 'INSERT',
  Delete: 'DELETE',
} as const

export type EditVerb = (typeof EditVerb)[keyof typeof EditVerb]

// One statement of the changes: its text with placeholders, the values bound to them, and the
// number of rows it must change. Anything else means the row changed since the grid read it (or its
// key did not tell it apart): the changes are then rolled back.
export interface EditStatement {
  readonly verb: EditVerb
  readonly sql: string
  // Every value is bound as text: the server reads it in the type of its column.
  readonly values: readonly string[]
  readonly expectedRows: number
  readonly row: RowTarget
  // The row as people tell it: id = 7, or new row 2.
  readonly label: string
}

export interface StatementTarget {
  readonly dialect: StatementDialect
  readonly table: EditableTable
}

export interface ChangedRow {
  readonly index: number
  // The row as the query returned it.
  readonly original: Row
  readonly cells: ReadonlyMap<number, PendingValue>
}

export interface AddedRow {
  readonly id: number
  // Its place among the rows added, from 1.
  readonly position: number
  readonly cells: ReadonlyMap<number, PendingValue>
}

const ONE_ROW = 1
const NULL = 'NULL'
const DEFAULT = 'DEFAULT'
const AND = ' AND '
const LIST = ', '
const MAX_LABEL_VALUE = 40
const ELLIPSIS = '…'
const BARE_VALUES: ReadonlySet<ValueType> = new Set<ValueType>([
  ValueType.Integer,
  ValueType.Decimal,
  ValueType.Float,
  ValueType.Boolean,
])

// The values bound to a statement, in the order of their placeholders.
class Parameters {
  readonly #dialect: StatementDialect
  readonly #values: string[] = []

  constructor(dialect: StatementDialect) {
    this.#dialect = dialect
  }

  get values(): readonly string[] {
    return this.#values
  }

  // The placeholder of a new bound value, cast to `type` when the column needs it.
  bind(value: string, type: string): string {
    this.#values.push(value)
    const placeholder = parameterPlaceholder(this.#dialect, this.#values.length - 1)
    return type === '' ? placeholder : `CAST(${placeholder} AS ${type})`
  }
}

// SET the new values WHERE the key is the row's and each changed column still holds what the grid
// read: a row someone else changed meanwhile is not overwritten, the statement changes no row.
export function updateStatement(target: StatementTarget, change: ChangedRow): EditStatement {
  const parameters = new Parameters(target.dialect)
  const changed = [...change.cells].sort(([left], [right]) => left - right)
  const assignments = changed.map(([index, value]) =>
    assignment(target, parameters, { column: columnAt(target.table, index), value }),
  )
  const checked = changed
    .map(([index]) => index)
    .filter((index) => !target.table.key.includes(index))
  const where = rowConditions(target, parameters, { original: change.original, checked })
  return {
    verb: EditVerb.Update,
    sql: `UPDATE ${tableName(target)} SET ${assignments.join(LIST)} WHERE ${where}`,
    values: parameters.values,
    expectedRows: ONE_ROW,
    row: { isNew: false, index: change.index },
    label: rowLabel(target.table, change.original),
  }
}

// DELETE the row WHERE the key is its key and every column the grid can change still holds what it
// read: a row someone else changed meanwhile is not deleted.
export function deleteStatement(
  target: StatementTarget,
  change: Omit<ChangedRow, 'cells'>,
): EditStatement {
  const parameters = new Parameters(target.dialect)
  const checked = target.table.columns.flatMap((column, index) =>
    column.value.type === ValueType.ReadOnly || target.table.key.includes(index) ? [] : [index],
  )
  const where = rowConditions(target, parameters, { original: change.original, checked })
  return {
    verb: EditVerb.Delete,
    sql: `DELETE FROM ${tableName(target)} WHERE ${where}`,
    values: parameters.values,
    expectedRows: ONE_ROW,
    row: { isNew: false, index: change.index },
    label: rowLabel(target.table, change.original),
  }
}

// Every column of the result, once: its value, NULL, or DEFAULT for what the grid left to the
// server (and for the columns only the server writes).
export function insertStatement(target: StatementTarget, row: AddedRow): EditStatement {
  const parameters = new Parameters(target.dialect)
  const columns = target.table.columns
    .map((column, index) => ({ column, value: row.cells.get(index) }))
    .filter(
      ({ column }, index, all) =>
        all.findIndex((other) => other.column.name === column.name) === index,
    )
  const names = columns.map(({ column }) => quoteIdentifier(target.dialect, column.name))
  const values = columns.map((entry) => valueSql(parameters, entry))
  return {
    verb: EditVerb.Insert,
    sql: `INSERT INTO ${tableName(target)} (${names.join(LIST)}) VALUES (${values.join(LIST)})`,
    values: parameters.values,
    expectedRows: ONE_ROW,
    row: { isNew: true, id: row.id },
    label: `new row ${String(row.position)}`,
  }
}

function tableName({ dialect, table }: StatementTarget): string {
  return qualifiedName(dialect, table.name)
}

function columnAt(table: EditableTable, index: number): EditableColumn {
  const column = table.columns.at(index)
  if (column === undefined) {
    throw new RangeError(`The result has no column ${String(index)}`)
  }
  return column
}

interface Assigned {
  readonly column: EditableColumn
  readonly value: PendingValue | undefined
}

function assignment(target: StatementTarget, parameters: Parameters, assigned: Assigned): string {
  return `${quoteIdentifier(target.dialect, assigned.column.name)} = ${valueSql(parameters, assigned)}`
}

function valueSql(parameters: Parameters, { column, value }: Assigned): string {
  if (value?.kind === PendingKind.Text) {
    return parameters.bind(value.text, column.sql.parameterType)
  }
  return value?.kind === PendingKind.Null ? NULL : DEFAULT
}

interface Conditions {
  readonly original: Row
  // The columns, besides the key, that must still hold what the grid read.
  readonly checked: readonly number[]
}

function rowConditions(
  target: StatementTarget,
  parameters: Parameters,
  { original, checked }: Conditions,
): string {
  const conditionOf = (index: number, isKey: boolean): string =>
    condition(target, parameters, {
      column: columnAt(target.table, index),
      original: original.at(index) ?? null,
      isKey,
    })
  return [
    ...target.table.key.map((index) => conditionOf(index, true)),
    ...checked.map((index) => conditionOf(index, false)),
  ].join(AND)
}

interface Compared {
  readonly column: EditableColumn
  readonly original: CellValue
  readonly isKey: boolean
}

// A key compares with the same equality as its unique index; other columns compare exactly, as the
// driver says (JSON as text, text in a collation where case and accents count).
function condition(target: StatementTarget, parameters: Parameters, compared: Compared): string {
  const name = quoteIdentifier(target.dialect, compared.column.name)
  if (compared.original === null) {
    return `${name} IS NULL`
  }
  const read: Read = { name, text: String(compared.original), sql: compared.column.sql }
  return compared.isKey ? keyCondition(parameters, read) : checkCondition(parameters, read)
}

interface Read {
  readonly name: string
  readonly text: string
  readonly sql: EditableColumn['sql']
}

function keyCondition(parameters: Parameters, { name, text, sql }: Read): string {
  return `${name} = ${parameters.bind(text, sql.parameterType)}`
}

function checkCondition(parameters: Parameters, { name, text, sql }: Read): string {
  const { parameterType, comparedAs, collation } = sql
  const column = comparedAs === '' ? name : `CAST(${name} AS ${comparedAs})`
  const value = parameters.bind(text, comparedAs === '' ? parameterType : '')
  return `${column} = ${collation === '' ? value : withCollation(value, collation)}`
}

function withCollation(value: string, collation: string): string {
  return `${value} COLLATE ${collation}`
}

function rowLabel(table: EditableTable, original: Row): string {
  return table.key
    .map((index) => {
      const column = columnAt(table, index)
      return `${column.name} = ${labelValue(original.at(index) ?? null, column)}`
    })
    .join(LIST)
}

function labelValue(value: CellValue, column: EditableColumn): string {
  if (value === null) {
    return NULL
  }
  const text = String(value)
  const shown =
    text.length > MAX_LABEL_VALUE ? `${text.slice(0, MAX_LABEL_VALUE)}${ELLIPSIS}` : text
  return BARE_VALUES.has(column.value.type) ? shown : `'${shown}'`
}
