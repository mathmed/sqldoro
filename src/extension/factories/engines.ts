import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { mysqlEngine } from '../../drivers/mysql/mysql-engine.ts'
import { postgresEngine } from '../../drivers/postgres/postgres-engine.ts'

// Registering a driver here is all it takes to support another engine.
export function createEngineRegistry(): EngineRegistry {
  return new EngineRegistry([mysqlEngine, postgresEngine])
}
