import { vi } from 'vitest'
// The extension's commands over in-memory storage and fake database sessions.
import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../src/core/connection/connection.ts'
import type { SecretKind } from '../../src/core/connection/secrets.ts'
import { EngineRegistry } from '../../src/core/engine/engine-registry.ts'
import type { EngineSession } from '../../src/core/engine/engine.ts'
import type { SessionRequest } from '../../src/core/session/open-session.ts'
import { ViewId } from '../../src/extension/command-id.ts'
import {
  type ConnectionCommandContext,
  registerConnectionCommands,
} from '../../src/extension/commands/connection-commands.ts'
import { registerExplorerCommands } from '../../src/extension/commands/explorer-commands.ts'
import { registerFindCommands } from '../../src/extension/commands/find-commands.ts'
import { registerFolderCommands } from '../../src/extension/commands/folder-commands.ts'
import { SchemaCache } from '../../src/extension/completion/schema-cache.ts'
import { ConnectionService } from '../../src/extension/connections/connection-service.ts'
import { listServerDatabases, pingServer } from '../../src/extension/connections/server-test.ts'
import { ConnectionForms } from '../../src/extension/form/connection-forms.ts'
import { TableSearchView } from '../../src/extension/search/table-search-view.ts'
import { SessionManager } from '../../src/extension/sessions/session-manager.ts'
import { readSettings } from '../../src/extension/settings.ts'
import { ConnectionStore } from '../../src/extension/storage/connection-store.ts'
import { SecretStore } from '../../src/extension/storage/secret-store.ts'
import { DatabaseSelection } from '../../src/extension/tree/database-selection.ts'
import { ExplorerProvider } from '../../src/extension/tree/explorer-provider.ts'
import { TableIndex } from '../../src/extension/tree/table-index.ts'
import { fakeEngine, fakeSession } from '../fakes/engine.ts'
import { FakeMemento, FakeSecretStorage } from '../fakes/extension-context.ts'
import { recordingLogger } from '../fakes/logger.ts'
import { Uri, window } from '../vscode.ts'
import { never } from './explorer.ts'

const MYSQL = fakeEngine({
  id: 'mysql',
  displayName: 'MySQL',
  defaultPort: 3306,
  urlSchemes: ['mysql'],
})
export const POSTGRES = fakeEngine({
  id: 'postgres',
  displayName: 'PostgreSQL',
  defaultPort: 5432,
  urlSchemes: ['postgres', 'postgresql'],
})

export interface CommandHarness {
  readonly context: ConnectionCommandContext
  readonly store: ConnectionStore
  readonly storage: FakeSecretStorage
  readonly memento: FakeMemento
  readonly requests: SessionRequest[]
  readonly close: ReturnType<typeof vi.fn>
  readonly viewMessages: string[]
  readonly log: ReturnType<typeof recordingLogger>
  readonly dispose: () => void
}

export interface HarnessOptions {
  readonly openError?: Error
  readonly memento?: FakeMemento
  // What the sessions answer; every list is empty by default.
  readonly session?: Partial<EngineSession>
}

export function commandHarness({
  openError,
  memento = new FakeMemento(),
  session = {},
}: HarnessOptions = {}): CommandHarness {
  const log = recordingLogger()
  const engines = new EngineRegistry([MYSQL, POSTGRES])
  const store = new ConnectionStore(memento, log)
  const storage = new FakeSecretStorage()
  const secrets = new SecretStore(storage)
  const requests: SessionRequest[] = []
  const close = vi.fn(async () => Promise.resolve())
  const open = async (request: SessionRequest): ReturnType<ConnectionCommandContext['open']> => {
    requests.push(request)
    return openError === undefined
      ? Promise.resolve({
          engine: POSTGRES,
          engineSession: fakeSession({ serverVersion: '18.6', ...session }),
          close,
        })
      : Promise.reject(openError)
  }
  const sessions = new SessionManager({
    open,
    readSecrets: async (connection) => secrets.read(connection),
    log,
    onConnectionLost: vi.fn(),
  })
  const service = new ConnectionService({ store, secrets, sessions, engines, createId: idMaker() })
  const index = new TableIndex({
    cache: new SchemaCache(log),
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
    delay: never,
    selection: new DatabaseSelection({ connections: () => store.list(), engines }),
    extensionUri: Uri.file('/ext') as unknown as vscode.Uri,
    log,
  })
  const viewMessages: string[] = []
  const extensionUri = Uri.file('/ext') as unknown as vscode.Uri
  const tableSearch = new TableSearchView({
    extensionUri,
    explorer,
    tree: window.createTreeView(ViewId.Connections, { treeDataProvider: explorer }),
    log,
  })
  const forms = new ConnectionForms({
    extensionUri,
    service,
    secrets,
    test: async (connection, typed) => pingServer({ open, log }, connection, typed),
    listDatabases: async (connection, typed) =>
      listServerDatabases({ open, log }, connection, typed),
    policy: () => readSettings().policy,
    log,
  })
  const context: ConnectionCommandContext = {
    service,
    sessions,
    secrets,
    open,
    explorer,
    index,
    log,
    forms,
    tableSearch,
    setViewMessage: (message) => viewMessages.push(message),
  }
  const disposables: vscode.Disposable[] = [
    forms,
    tableSearch,
    window.registerWebviewViewProvider(ViewId.TableSearch, tableSearch as never),
    ...registerConnectionCommands(context),
    ...registerExplorerCommands(context),
    ...registerFolderCommands(context),
    ...registerFindCommands(context),
  ]
  const dispose = (): void => {
    for (const disposable of disposables) {
      disposable.dispose()
    }
  }
  return { context, store, storage, memento, requests, close, viewMessages, log, dispose }
}

function idMaker(): () => string {
  let next = 0
  return () => {
    next += 1
    return `id-${String(next)}`
  }
}

export async function saved(
  harness: CommandHarness,
  connection: ConnectionConfig,
  secrets: ReadonlyMap<SecretKind, string> = new Map(),
): Promise<ConnectionConfig> {
  await harness.context.service.save(connection, secrets)
  return connection
}
