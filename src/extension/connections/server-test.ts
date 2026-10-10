import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionSecrets } from '../../core/connection/secrets.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import type { Logger } from '../../core/platform.ts'
import type { Session } from '../../core/session/open-session.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SessionOpener } from '../sessions/session-opener.ts'

export interface ServerTestDependencies {
  readonly open: SessionOpener
  readonly log: Logger
}

interface ShortSessionRequest {
  readonly connection: ConnectionConfig
  readonly secrets: ConnectionSecrets
}

// Opens a session, pings the server and closes it again: the saved connection is not changed.
// Resolves with the server and its version, such as "PostgreSQL 18.6".
export async function pingServer(
  dependencies: ServerTestDependencies,
  connection: ConnectionConfig,
  secrets: ConnectionSecrets,
): Promise<string> {
  return onShortSession(dependencies, { connection, secrets }, async (session) => {
    await session.engineSession.ping()
    return `${session.engine.displayName} ${session.engineSession.serverVersion}`
  })
}

// Opens a session, lists the databases of the server from its catalog and closes it again.
export async function listServerDatabases(
  dependencies: ServerTestDependencies,
  connection: ConnectionConfig,
  secrets: ConnectionSecrets,
): Promise<readonly string[]> {
  return onShortSession(dependencies, { connection, secrets }, async (session) => {
    const databases = await session.engineSession.listDatabases(CatalogDetail.Names)
    return databases.map((database) => database.name)
  })
}

// The session is closed whatever the work does.
async function onShortSession<T>(
  { open, log }: ServerTestDependencies,
  { connection, secrets }: ShortSessionRequest,
  work: (session: Session) => Promise<T>,
): Promise<T> {
  const session = await open({
    connection,
    secrets,
    onUnexpectedClose: (error) => {
      log.debug(`The short session of ${connection.name} ended: ${describeError(error)}`)
    },
  })
  try {
    return await work(session)
  } finally {
    await session.close()
  }
}
