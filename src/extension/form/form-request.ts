import type { FormMode } from '../../core/connection-form/protocol.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionSecrets, SecretKind } from '../../core/connection/secrets.ts'
import type { Logger } from '../../core/platform.ts'
import type { GuardPolicy } from '../../core/safety/guard.ts'
import type { ConnectionService } from '../connections/connection-service.ts'
import type { SecretChanges, SecretStore } from '../storage/secret-store.ts'

// What a form opens on.
export interface FormRequest {
  readonly mode: FormMode
  readonly connection: ConnectionConfig
  // The secrets the extension holds for the connection: stored, or from an imported URL.
  readonly heldSecrets: ReadonlySet<SecretKind>
  // Secrets not stored yet that go with the connection once saved: the password of a URL.
  readonly pendingSecrets: SecretChanges
  // What the form says above its fields, such as what an imported URL held that was ignored.
  readonly notices: readonly string[]
}

// What a form needs from the extension: the connections, their secrets, a server to test, and the
// environments the settings treat as production.
export interface FormServices {
  readonly service: ConnectionService
  readonly secrets: SecretStore
  readonly test: (connection: ConnectionConfig, secrets: ConnectionSecrets) => Promise<string>
  readonly policy: () => GuardPolicy
  readonly log: Logger
}
