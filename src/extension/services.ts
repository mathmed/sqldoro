import { randomUUID } from 'node:crypto'

import type * as vscode from 'vscode'

import type { EngineRegistry } from '../core/engine/engine-registry.ts'
import type { Logger } from '../core/platform.ts'
import { showConnectionLost } from './connections/connection-lost.ts'
import { ConnectionService } from './connections/connection-service.ts'
import { hostKeyPrompt } from './connections/host-key-prompt.ts'
import { createEngineRegistry } from './factories/engines.ts'
import { createTunnelOpener } from './factories/tunnels.ts'
import { localFiles } from './platform/local-files.ts'
import { SessionManager } from './sessions/session-manager.ts'
import { createSessionOpener, type SessionOpener } from './sessions/session-opener.ts'
import { ConnectionStore } from './storage/connection-store.ts'
import { KnownHosts } from './storage/known-hosts.ts'
import { SecretStore } from './storage/secret-store.ts'
import { ExplorerProvider } from './tree/explorer-provider.ts'

export type StorageContext = Pick<vscode.ExtensionContext, 'globalState' | 'secrets'>

export interface Services {
  readonly engines: EngineRegistry
  readonly store: ConnectionStore
  readonly secrets: SecretStore
  readonly open: SessionOpener
  readonly sessions: SessionManager
  readonly service: ConnectionService
  readonly explorer: ExplorerProvider
}

// Connection metadata goes to the global state, secrets to the secret storage, and the drivers and
// the SSH tunnel come from the factories.
export function createServices(context: StorageContext, log: Logger): Services {
  const engines = createEngineRegistry()
  const store = new ConnectionStore(context.globalState, log)
  const secrets = new SecretStore(context.secrets)
  const knownHosts = new KnownHosts(context.globalState, hostKeyPrompt)
  const open = createSessionOpener({
    engines,
    tunnels: createTunnelOpener(log),
    files: localFiles,
    verifyHostKey: knownHosts.verify,
  })
  const sessions = new SessionManager({
    open,
    readSecrets: async (connection) => secrets.read(connection),
    log,
    onConnectionLost: showConnectionLost,
  })
  const service = new ConnectionService({ store, secrets, sessions, engines, createId: randomUUID })
  const explorer = new ExplorerProvider({ connections: () => store.list(), sessions, engines, log })
  return { engines, store, secrets, open, sessions, service, explorer }
}
