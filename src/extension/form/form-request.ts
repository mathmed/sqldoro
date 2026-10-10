import type { FormMode, FormStart } from '../../core/connection-form/protocol.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionSecrets, SecretKind } from '../../core/connection/secrets.ts'
import type { Logger } from '../../core/platform.ts'
import type { GuardPolicy } from '../../core/safety/guard.ts'
import type { ConnectionService } from '../connections/connection-service.ts'
import type { SecretStore } from '../storage/secret-store.ts'

// What a form opens on.
export interface FormRequest {
  readonly mode: FormMode
  readonly start: FormStart
  readonly connection: ConnectionConfig
  // The secrets the secret storage holds for the connection.
  readonly storedSecrets: ReadonlySet<SecretKind>
}

// Runs against the server of a connection that may not be saved, with the secrets given.
export type ServerCheck<T> = (
  connection: ConnectionConfig,
  secrets: ConnectionSecrets,
) => Promise<T>

// What a form needs from the extension: the connections, their secrets, a server to test and list
// the databases of, and the environments the settings treat as production.
export interface FormServices {
  readonly service: ConnectionService
  readonly secrets: SecretStore
  // Resolves with the server and its version.
  readonly test: ServerCheck<string>
  // Resolves with the names of the databases of the server.
  readonly listDatabases: ServerCheck<readonly string[]>
  readonly policy: () => GuardPolicy
  readonly log: Logger
}
