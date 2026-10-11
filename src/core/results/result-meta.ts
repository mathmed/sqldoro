import type { ObjectRef } from '../engine/catalog.ts'
import type { ResultColumn, Row } from '../engine/query.ts'
import { type TableColumn, type TableDescription, ValueType } from '../engine/table.ts'
import { keyText } from '../navigation/keys.ts'
import {
  type ColumnSource,
  type KeyColumn,
  linkAt,
  linkLabel,
  referenceLabel,
  type ResultLink,
  resultLinks,
  type ResultReference,
  resultReferences,
  type TableLinks,
} from '../navigation/links.ts'
import type { ColumnMeta } from './tab-meta.ts'

// What the catalog says of the columns of a result: where its foreign keys lead, what references
// its rows, the values of its enums, and how its values compare exactly. The host works it out once
// a statement ran; until then a result has none.
export interface ResultMeta {
  // For the view, one per column of the result.
  readonly columns: readonly ColumnMeta[]
  readonly links: readonly ResultLink[]
  readonly references: readonly ResultReference[]
  readonly referenceLabels: readonly string[]
  // The type each column's values are compared as, by column name, where the catalog says.
  readonly parameterTypes: ReadonlyMap<string, string>
  // The primary key of the table of the result, where the result holds it: what names a row.
  readonly rowKey: readonly KeyColumn[]
  // The table of the result: the tables it links to are named from it. Nowhere without one.
  readonly home: ObjectRef
}

const NOWHERE: ObjectRef = { database: '', schema: '', name: '' }

export const NO_META: ResultMeta = {
  columns: [],
  links: [],
  references: [],
  referenceLabels: [],
  parameterTypes: new Map(),
  rowKey: [],
  home: NOWHERE,
}

// A table the columns of a result come from, as the catalog describes it, by the key its columns
// name it with (the engine's reference of the table, as text).
export interface DescribedTable {
  readonly key: string
  readonly description: TableDescription
  readonly links: TableLinks
}

// The key a table is known by in the sources of the columns: its reference, as the server named it.
export function tableKey(table: readonly string[]): string {
  return JSON.stringify(table)
}

// Where each column of a result comes from, by the name of the column in its table; undefined for
// an expression or a table the catalog did not describe.
export function columnSources(
  columns: readonly ResultColumn[],
  tables: readonly DescribedTable[],
): (ColumnSource | undefined)[] {
  return columns.map(({ origin }) => {
    if (origin === undefined) {
      return undefined
    }
    const key = tableKey(origin.table)
    const table = tables.find((described) => described.key === key)
    const column = table?.description.columns.find(({ reference }) => reference === origin.column)
    return column === undefined ? undefined : { table: key, column: column.name }
  })
}

export function resultMeta(
  columns: readonly ResultColumn[],
  tables: readonly DescribedTable[],
): ResultMeta {
  const sources = columnSources(columns, tables)
  const linked = tables.map(({ links }) => links)
  const links = resultLinks(sources, linked)
  const references = resultReferences(sources, linked)
  const home = tables.at(0)?.description.ref ?? NOWHERE
  return {
    columns: sources.map((source, index) => ({
      choices: choicesOf(source, tables),
      reference: labelAt(links, { index, home }),
    })),
    links,
    references,
    referenceLabels: references.map(({ reference }) => referenceLabel(reference, home)),
    parameterTypes: parameterTypesOf(columns, { sources, tables }),
    rowKey: rowKeyOf(sources, tables.at(0)),
    home,
  }
}

function labelAt(
  links: readonly ResultLink[],
  { index, home }: { readonly index: number; readonly home: ObjectRef },
): string {
  const link = linkAt(links, index)
  return link === undefined ? '' : linkLabel(link.foreignKey, home)
}

function columnOf(
  source: ColumnSource | undefined,
  tables: readonly DescribedTable[],
): TableColumn | undefined {
  const table = tables.find(({ key }) => key === source?.table)
  return table?.description.columns.find(({ name }) => name === source?.column)
}

function choicesOf(
  source: ColumnSource | undefined,
  tables: readonly DescribedTable[],
): readonly string[] {
  const value = columnOf(source, tables)?.value
  return value?.type === ValueType.Choice ? value.options : []
}

interface Sourced {
  readonly sources: readonly (ColumnSource | undefined)[]
  readonly tables: readonly DescribedTable[]
}

function parameterTypesOf(
  columns: readonly ResultColumn[],
  { sources, tables }: Sourced,
): ReadonlyMap<string, string> {
  return new Map(
    columns.flatMap(({ name }, index) => {
      const type = columnOf(sources.at(index), tables)?.sql.parameterType ?? ''
      return type === '' ? [] : [[name, type] as const]
    }),
  )
}

// The first key of the table (its primary key, when it has one), where the result holds it whole.
function rowKeyOf(
  sources: readonly (ColumnSource | undefined)[],
  table: DescribedTable | undefined,
): KeyColumn[] {
  if (table === undefined) {
    return []
  }
  return table.description.keys.slice(0, 1).flatMap((key) => {
    const columns = key.map((column) => ({
      column,
      position: sources.findIndex(
        (source) => source?.table === table.key && source.column === column,
      ),
    }))
    return columns.some(({ position }) => position === -1) ? [] : columns
  })
}

// "#1": the row as the trail names it, by its key; empty when the result does not hold the key or a
// part of it is NULL.
export function rowLabel(meta: ResultMeta, row: Row): string {
  const parts = meta.rowKey.map(({ column, position }) => ({ column, value: row.at(position) }))
  const values = parts.flatMap(({ column, value }) =>
    value === null || value === undefined ? [] : [{ column, value }],
  )
  return parts.length === 0 || values.length < parts.length
    ? ''
    : keyText({ parts: values, isRowKey: true })
}
