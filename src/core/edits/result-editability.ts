import type { EngineSession } from '../engine/engine.ts'
import type { ResultColumn } from '../engine/query.ts'
import { type Editability, editableTable, resultOrigin } from './editability.ts'
import { selectShape, type ShapeDialect } from './select-shape.ts'

// The rows of a query the grid may edit: its text, the columns the server returned for it, and the
// database it ran in.
export interface QueriedRows {
  readonly sql: string
  readonly columns: readonly ResultColumn[]
  readonly dialect: ShapeDialect
  readonly database: string
}

// Whether the rows of a query can be edited, and how: what its text says, the table the server
// says its columns come from, and that table as the catalog describes it. The catalog is read
// only when the text and the columns allow editing.
export async function resultEditability(
  catalog: Pick<EngineSession, 'describeTable'>,
  rows: QueriedRows,
): Promise<Editability> {
  const shape = selectShape(rows.sql, rows.dialect)
  if ('problem' in shape) {
    return shape
  }
  const origin = resultOrigin(rows.columns)
  if ('problem' in origin) {
    return origin
  }
  const description = await catalog.describeTable(rows.database, origin.table)
  return editableTable({ reference: shape.table, columns: rows.columns, description })
}
