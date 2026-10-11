import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ObjectRef } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Logger } from '../../core/platform.ts'
import { describeError } from '../../core/text/errors.ts'
import type { RunTarget } from '../editor/run-types.ts'
import type { TableMetadata } from './table-metadata.ts'

export interface TypesContext {
  readonly metadata: TableMetadata
  // The session of the explorer on a connection, where the catalog is read.
  readonly catalogOf: (connection: ConnectionConfig) => Promise<EngineSession>
  readonly log: Logger
}

// The type the values of each column of a table are compared as (MySQL compares a BIGINT with text
// as floating-point numbers), read from the catalog. When the catalog cannot say, the values go as
// they are, and the log says why.
export async function parameterTypesOf(
  context: TypesContext,
  target: Pick<RunTarget, 'connection' | 'engine'>,
  table: ObjectRef,
): Promise<ReadonlyMap<string, string>> {
  try {
    const session = await context.catalogOf(target.connection)
    const source = { connectionId: target.connection.id, session, dialect: target.engine.dialect }
    return await context.metadata.parameterTypes(source, table)
  } catch (error) {
    context.log.warn(
      `Could not read how the values of a table compare from the catalog: ${describeError(error)}`,
    )
    return new Map()
  }
}
