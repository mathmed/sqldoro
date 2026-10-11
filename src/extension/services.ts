import { randomUUID } from 'node:crypto'

import type * as vscode from 'vscode'

import type { EngineRegistry } from '../core/engine/engine-registry.ts'
import type { Logger } from '../core/platform.ts'
import { SchemaCache } from './completion/schema-cache.ts'
import { showConnectionLost } from './connections/connection-lost.ts'
import { ConnectionService } from './connections/connection-service.ts'
import { hostKeyPrompt } from './connections/host-key-prompt.ts'
import { createEngineRegistry } from './factories/engines.ts'
import { createTunnelOpener } from './factories/tunnels.ts'
import { localFiles } from './platform/local-files.ts'
import { delay } from './platform/timeout.ts'
import { SessionManager } from './sessions/session-manager.ts'
import { createSessionOpener, type SessionOpener } from './sessions/session-opener.ts'
import { readSettings } from './settings.ts'
import { ConnectionStore } from './storage/connection-store.ts'
import { KnownHosts } from './storage/known-hosts.ts'
import { SecretStore } from './storage/secret-store.ts'
import { ExplorerProvider } from './tree/explorer-provider.ts'
import { TableIndex } from './tree/table-index.ts'

export type StorageContext = Pick<vscode.ExtensionContext, 'globalState' | 'secrets'>

export interface Services {
  readonly engines: EngineRegistry
  readonly store: ConnectionStore
  readonly secrets: SecretStore
  readonly open: SessionOpener
  readonly sessions: SessionManager
  readonly service: ConnectionService
  readonly explorer: ExplorerProvider
  // What the autocomplete, the explorer and the result grid know of each catalog.
  readonly schemaCache: SchemaCache
  readonly index: TableIndex
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
  return {
    engines,
    store,
    secrets,
    open,
    sessions,
    service,
    ...createCatalog({ store, sessions, engines }, log),
  }
}

type CatalogParts = Pick<Services, 'engines' | 'sessions' | 'store'>

// The catalog of the connections as the explorer, the autocomplete and the grid see it.
function createCatalog(
  { store, sessions, engines }: CatalogParts,
  log: Logger,
): Pick<Services, 'explorer' | 'index' | 'schemaCache'> {
  const schemaCache = new SchemaCache(log)
  const index = new TableIndex({
    cache: schemaCache,
    connections: () => store.list(),
    sessions,
    engines,
    log,
  })
  const explorer = new ExplorerProvider({
    connections: () => store.list(),
    sessions,
    engines,
    index,
    policy: () => readSettings().policy,
    delay,
    log,
  })
  return { explorer, index, schemaCache }
}
