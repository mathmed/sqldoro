import type { ResultColumn } from '../../core/engine/query.ts'
import type { Logger } from '../../core/platform.ts'
import { type DescribedTable, resultMeta, tableKey } from '../../core/results/result-meta.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { describeError } from '../../core/text/errors.ts'
import type { RunParts } from '../editor/run-types.ts'
import type { CatalogSource, TableMetadata } from './table-metadata.ts'

// A result made of many tables gets the links of the first ones only.
const MAX_TABLES = 10

// Works out what the catalog says of the columns of a tab that just ran (where its foreign keys
// lead, what references its rows, the values of its enums) and tells the view. It reads the catalog
// on the session of the explorer, and leaves the tab as it was when the catalog cannot say, or when
// other columns came meanwhile.
export async function describeResult(
  parts: RunParts,
  tab: ResultSet,
  context: { readonly metadata: TableMetadata; readonly log: Logger },
): Promise<void> {
  const { columns } = tab
  const source: CatalogSource = {
    connectionId: parts.target.connection.id,
    session: parts.catalog,
    dialect: parts.target.engine.dialect,
  }
  try {
    const tables = await describedTables(columns, {
      source,
      metadata: context.metadata,
      database: parts.target.scope.database,
    })
    if (tab.columns === columns) {
      tab.describeMeta(resultMeta(columns, tables))
      parts.panel.updateTab(tab, true)
    }
  } catch (error) {
    context.log.warn(
      `Could not read the links of a result from the catalog: ${describeError(error)}`,
    )
  }
}

interface Reading {
  readonly source: CatalogSource
  readonly metadata: TableMetadata
  readonly database: string
}

async function describedTables(
  columns: readonly ResultColumn[],
  reading: Reading,
): Promise<DescribedTable[]> {
  const origins = new Map(
    columns.flatMap(({ origin }) =>
      origin === undefined ? [] : [[tableKey(origin.table), origin.table]],
    ),
  )
  const tables = await Promise.all(
    [...origins]
      .slice(0, MAX_TABLES)
      .map(async ([key, table]) => describedTable(key, table, reading)),
  )
  return tables.flatMap((table) => (table === undefined ? [] : [table]))
}

async function describedTable(
  key: string,
  table: readonly string[],
  { source, metadata, database }: Reading,
): Promise<DescribedTable | undefined> {
  const description = await metadata.describe(source, { database, table })
  if (description === undefined) {
    return undefined
  }
  const relations = await metadata.relations(source, description.ref)
  return { key, description, links: { table: key, ...relations } }
}
