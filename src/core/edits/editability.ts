import type { ResultColumn } from '../engine/query.ts'
import {
  RelationKind,
  type TableColumn,
  type TableDescription,
  type ValueSpec,
  type ValueSql,
  ValueType,
} from '../engine/table.ts'
import type { TableReference } from './select-shape.ts'

// A column of an editable result: the table column it shows, and how its values are typed and
// written (read-only, saying why, when this result column cannot be changed).
export interface EditableColumn {
  readonly name: string
  readonly value: ValueSpec
  readonly sql: ValueSql
  readonly isNullable: boolean
  // Whether an INSERT can leave it to the server.
  readonly hasDefault: boolean
}

export interface EditableTable {
  // The schema and the name of the table: statements quote them.
  readonly name: readonly string[]
  // How people read it: sales.orders.
  readonly label: string
  // One per result column, in order.
  readonly columns: readonly EditableColumn[]
  // The result columns that hold the key that tells the rows apart, in key order.
  readonly key: readonly number[]
  // Why rows cannot be added (a column that needs a value cannot be given one); empty when they can.
  readonly insertProblem: string
}

export type Editability = { readonly table: EditableTable } | { readonly problem: string }

export type OriginReading = { readonly table: readonly string[] } | { readonly problem: string }

export interface EditTarget {
  readonly reference: TableReference
  readonly columns: readonly ResultColumn[]
  readonly description: TableDescription | undefined
}

const KIND_PROBLEMS: ReadonlyMap<RelationKind, string> = new Map([
  [RelationKind.View, 'The rows come from a view: sqldoro only edits the rows of tables.'],
  [
    RelationKind.MaterializedView,
    'The rows come from a materialized view, which cannot be edited.',
  ],
  [
    RelationKind.ForeignTable,
    'The rows come from a foreign table: sqldoro only edits the rows of tables.',
  ],
  [RelationKind.Other, 'The rows do not come from a table.'],
])
// Values that compare exactly with what the grid shows: what a key can be made of.
const KEY_TYPES: ReadonlySet<ValueType> = new Set<ValueType>([
  ValueType.Integer,
  ValueType.Decimal,
  ValueType.Boolean,
  ValueType.Text,
  ValueType.Date,
  ValueType.Time,
  ValueType.Timestamp,
  ValueType.Year,
  ValueType.Choice,
  ValueType.Uuid,
  ValueType.Server,
])
// A table is named by its schema and its name; a longer name in the query also names a database.
const QUALIFIED_PARTS = 2
const COMPUTED = 'The server computes this column.'
const SHOWN_TWICE = 'This column shows more than once in the result: edit it where it shows once.'

// The table every column of a result comes from, as the server named it.
export function resultOrigin(columns: readonly ResultColumn[]): OriginReading {
  const origins = columns.flatMap(({ origin }) => (origin === undefined ? [] : [origin]))
  const unknown = columns.find(({ origin }) => origin === undefined)
  if (unknown !== undefined) {
    return { problem: `The server does not say which table "${unknown.name}" comes from.` }
  }
  const tables = new Map(origins.map(({ table }) => [JSON.stringify(table), table]))
  const [table, ...others] = tables.values()
  if (table === undefined) {
    return { problem: 'The query returns no columns.' }
  }
  return others.length === 0
    ? { table }
    : { problem: 'The columns of the query come from several tables.' }
}

export function editableTable({ reference, columns, description }: EditTarget): Editability {
  if (description === undefined) {
    return { problem: 'sqldoro cannot find the table of these rows in the catalog.' }
  }
  const problem = tableProblem(description, reference)
  return problem === '' ? editableColumns(description, columns) : { problem }
}

function tableProblem(description: TableDescription, reference: TableReference): string {
  const problem = KIND_PROBLEMS.get(description.kind) ?? description.problem
  if (problem !== '' || isNamed(description, reference)) {
    return problem
  }
  return 'The query and the server name different tables: sqldoro cannot tell which table the rows come from.'
}

// The name in the query is the table the server read: the last parts of the qualified name, without
// case (MySQL may ignore it, PostgreSQL folds what is not quoted).
function isNamed({ ref }: TableDescription, { parts }: TableReference): boolean {
  const written = parts.slice(-QUALIFIED_PARTS).map((part) => part.toLowerCase())
  const named = [ref.schema, ref.name].slice(-written.length).map((part) => part.toLowerCase())
  return JSON.stringify(written) === JSON.stringify(named)
}

function editableColumns(
  description: TableDescription,
  columns: readonly ResultColumn[],
): Editability {
  const label = `${description.ref.schema}.${description.ref.name}`
  const shown = columns.map(({ origin }) =>
    description.columns.find(({ reference }) => reference === origin?.column),
  )
  if (!isComplete(shown)) {
    const missing = columns.filter((...[, index]) => shown.at(index) === undefined)
    const names = missing.map(({ name }) => `"${name}"`).join(', ')
    return { problem: `sqldoro cannot find ${names} in ${label}.` }
  }
  return keyed(description, { label, shown })
}

function isComplete(shown: readonly (TableColumn | undefined)[]): shown is readonly TableColumn[] {
  return shown.every((column) => column !== undefined)
}

interface Shown {
  readonly label: string
  readonly shown: readonly TableColumn[]
}

function keyed(description: TableDescription, { label, shown }: Shown): Editability {
  const names = shown.map(({ name }) => name)
  const byName = new Map(shown.map((column) => [column.name, column]))
  const key = description.keys.find((columns) =>
    columns.every((name) => isKeyColumn(byName.get(name))),
  )
  if (key === undefined) {
    return { problem: keyProblem(description, label) }
  }
  const columns = shown.map((column) => editableColumn(column, names))
  return {
    table: {
      name: [description.ref.schema, description.ref.name],
      label,
      columns,
      key: key.map((name) => names.indexOf(name)),
      insertProblem: insertProblem(description, columns),
    },
  }
}

function isKeyColumn(column: TableColumn | undefined): boolean {
  return column !== undefined && KEY_TYPES.has(column.value.type) && !isMultipleChoice(column.value)
}

function isMultipleChoice(value: ValueSpec): boolean {
  return value.type === ValueType.Choice && value.isMultiple
}

function keyProblem(description: TableDescription, label: string): string {
  const [primary] = description.keys
  return primary === undefined
    ? `${label} has no primary key and no unique key without NULLs: sqldoro cannot tell its rows apart.`
    : `The result does not include the primary key of ${label} (${primary.join(', ')}) or another unique key without NULLs that sqldoro can compare: add it to the query to edit rows.`
}

function editableColumn(column: TableColumn, names: readonly string[]): EditableColumn {
  const isShownOnce = names.indexOf(column.name) === names.lastIndexOf(column.name)
  const reason = column.isWritable ? SHOWN_TWICE : COMPUTED
  return {
    name: column.name,
    value: column.isWritable && isShownOnce ? column.value : { type: ValueType.ReadOnly, reason },
    sql: column.sql,
    isNullable: column.isNullable,
    hasDefault: column.hasDefault,
  }
}

// Adding a row needs a value for every column that has no default and takes values: the result
// must show it, in a cell the grid can change.
function insertProblem(description: TableDescription, columns: readonly EditableColumn[]): string {
  const settable = new Set(
    columns.filter(({ value }) => value.type !== ValueType.ReadOnly).map(({ name }) => name),
  )
  const required = description.columns
    .filter((column) => !column.hasDefault && column.isWritable && !settable.has(column.name))
    .map(({ name }) => name)
  if (required.length === 0) {
    return ''
  }
  const them = required.length === 1 ? 'it' : 'them'
  return `Adding rows needs a value for ${required.join(', ')}: add ${them} to the query, once.`
}
