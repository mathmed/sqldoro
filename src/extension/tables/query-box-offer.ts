import type { ObjectRef } from '../../core/engine/catalog.ts'
import { describeError } from '../../core/text/errors.ts'
import type { RunParts } from '../editor/run-types.ts'
import type { TableContext } from './table-context.ts'

// What the query box of a table panel works with: the tables and views of the schema of its table
// (read on the session of the explorer, once per schema), and the height the user gave the box.
// It only helps: a catalog that cannot be read leaves the box without its tables, and the log says
// why.
export async function offerQueryBox(
  context: TableContext,
  parts: RunParts,
  table: ObjectRef,
): Promise<void> {
  const tables = await tablesOf(context, parts, table)
  parts.panel.offerQueryBox({ tables, height: context.queryHeight.get() })
}

async function tablesOf(
  context: TableContext,
  { target, catalog }: RunParts,
  { database, schema }: ObjectRef,
): Promise<string[]> {
  const source = {
    connectionId: target.connection.id,
    session: catalog,
    dialect: target.engine.dialect,
  }
  try {
    return await context.metadata.objectNames(source, { database, schema })
  } catch (error) {
    context.log.warn(
      `Could not read the tables of the schema for the query box: ${describeError(error)}`,
    )
    return []
  }
}
