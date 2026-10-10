import { vi } from 'vitest'
// The extension's commands over in-memory storage and fake database sessions.
import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../src/core/connection/connection.ts'
import type { SecretKind } from '../../src/core/connection/secrets.ts'
import { EngineRegistry } from '../../src/core/engine/engine-registry.ts'
import type { SessionRequest } from '../../src/core/session/open-session.ts'
import type { CommandContext } from '../../src/extension/commands/command-context.ts'
import { registerConnectionCommands } from '../../src/extension/commands/connection-commands.ts'
import { registerExplorerCommands } from '../../src/extension/commands/explorer-commands.ts'
import { ConnectionService } from '../../src/extension/connections/connection-service.ts'
import { SessionManager } from '../../src/extension/sessions/session-manager.ts'
import { ConnectionStore } from '../../src/extension/storage/connection-store.ts'
import { SecretStore } from '../../src/extension/storage/secret-store.ts'
import { ExplorerProvider } from '../../src/extension/tree/explorer-provider.ts'
import { fakeEngine, fakeSession } from '../fakes/engine.ts'
import { FakeMemento, FakeSecretStorage } from '../fakes/extension-context.ts'
import { recordingLogger } from '../fakes/logger.ts'

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
  readonly context: CommandContext
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
}

export function commandHarness({
  openError,
  memento = new FakeMemento(),
}: HarnessOptions = {}): CommandHarness {
  const log = recordingLogger()
  const engines = new EngineRegistry([MYSQL, POSTGRES])
  const store = new ConnectionStore(memento, log)
  const storage = new FakeSecretStorage()
  const secrets = new SecretStore(storage)
  const requests: SessionRequest[] = []
  const close = vi.fn(async () => Promise.resolve())
  const open = async (request: SessionRequest): ReturnType<CommandContext['open']> => {
    requests.push(request)
    return openError === undefined
      ? Promise.resolve({
          engine: POSTGRES,
          engineSession: fakeSession({ serverVersion: '18.6' }),
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
  const explorer = new ExplorerProvider({ connections: () => store.list(), sessions, engines, log })
  const viewMessages: string[] = []
  const context: CommandContext = {
    service,
    sessions,
    secrets,
    open,
    explorer,
    log,
    setViewMessage: (message) => viewMessages.push(message),
  }
  const disposables: vscode.Disposable[] = [
    ...registerConnectionCommands(context),
    ...registerExplorerCommands(context),
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
