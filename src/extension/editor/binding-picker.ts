import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { EditorBinding } from '../../core/editor/binding.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Session } from '../../core/session/open-session.ts'
import { askChoice } from '../form/prompts.ts'

export interface BindingPickerDependencies {
  readonly connections: () => readonly ConnectionConfig[]
  readonly connect: (connection: ConnectionConfig) => Promise<Session>
  readonly engines: EngineRegistry
}

// Asks for the connection of an editor, then its database and (PostgreSQL) schema. Choosing one is
// an explicit action: the connection opens to list them.
export async function pickBinding(
  dependencies: BindingPickerDependencies,
): Promise<EditorBinding | undefined> {
  const connection = await pickConnection(dependencies.connections())
  return connection === undefined ? undefined : pickScope(dependencies, connection)
}

async function pickConnection(
  connections: readonly ConnectionConfig[],
): Promise<ConnectionConfig | undefined> {
  if (connections.length === 0) {
    void vscode.window.showInformationMessage('There is no connection yet: add one first.')
    return undefined
  }
  return askChoice(
    'Choose the Connection of this Editor',
    connections.map((candidate) => ({
      label: candidate.name,
      description: candidate.host,
      value: candidate,
    })),
  )
}

async function pickScope(
  dependencies: BindingPickerDependencies,
  connection: ConnectionConfig,
): Promise<EditorBinding | undefined> {
  const { engineSession } = await dependencies.connect(connection)
  const database = await pickDatabase(engineSession, connection.database)
  if (database === undefined) {
    return undefined
  }
  const dialect = dependencies.engines.get(connection.engine).dialect
  const schema = dialect.hasSchemas
    ? await pickSchema(engineSession, database, dialect.defaultSchema)
    : ''
  return schema === undefined ? undefined : { connectionId: connection.id, database, schema }
}

// The database of the connection comes first.
async function pickDatabase(
  session: EngineSession,
  preferred: string,
): Promise<string | undefined> {
  const names = (await session.listDatabases(CatalogDetail.Names)).map((database) => database.name)
  return askChoice(
    'Choose the Database',
    ordered(names, preferred).map((name) => ({ label: name, value: name })),
  )
}

async function pickSchema(
  session: EngineSession,
  database: string,
  preferred: string,
): Promise<string | undefined> {
  const names = (await session.listSchemas(database)).map((schema) => schema.name)
  return askChoice(
    'Choose the Schema',
    ordered(names, preferred).map((name) => ({ label: name, value: name })),
  )
}

function ordered(names: readonly string[], preferred: string): string[] {
  return names.includes(preferred)
    ? [preferred, ...names.filter((name) => name !== preferred)]
    : [...names]
}
