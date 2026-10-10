import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionSecrets } from '../../core/connection/secrets.ts'
import type { Logger } from '../../core/platform.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SessionOpener } from '../sessions/session-opener.ts'

export interface ServerTestDependencies {
  readonly open: SessionOpener
  readonly log: Logger
}

// Opens a session, pings the server and closes it again: the saved connection is not changed.
// Resolves with the server and its version, such as "PostgreSQL 18.6".
export async function pingServer(
  { open, log }: ServerTestDependencies,
  connection: ConnectionConfig,
  secrets: ConnectionSecrets,
): Promise<string> {
  const session = await open({
    connection,
    secrets,
    onUnexpectedClose: (error) => {
      log.debug(`The test session of ${connection.name} ended: ${describeError(error)}`)
    },
  })
  try {
    await session.engineSession.ping()
    return `${session.engine.displayName} ${session.engineSession.serverVersion}`
  } finally {
    await session.close()
  }
}
