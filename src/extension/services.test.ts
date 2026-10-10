import { createServer } from 'node:net'

import { describe, expect, it } from 'vitest'

import { FakeMemento, FakeSecretStorage } from '../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../test/fakes/logger.ts'
import { type ConnectionConfig, newConnection } from '../core/connection/connection.ts'
import { SecretKind } from '../core/connection/secrets.ts'
import { createServices } from './services.ts'
import { ConnectionStatus } from './sessions/session-manager.ts'

// A local port nothing listens on: connecting to it is refused at once.
async function closedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  return typeof address === 'object' && address !== null ? address.port : 0
}

describe('createServices', () => {
  it('should wire the real engines, the saved connections and their secrets', async () => {
    const services = createServices(
      { globalState: new FakeMemento(), secrets: new FakeSecretStorage() },
      recordingLogger(),
    )
    const connection: ConnectionConfig = {
      ...newConnection('local', services.engines.get('postgres')),
      name: 'Local',
      host: '127.0.0.1',
      port: await closedPort(),
      user: 'app',
    }
    await services.service.save(connection, new Map([[SecretKind.Password, 'never-shown']]))

    await expect(services.explorer.getChildren()).resolves.toHaveLength(1)
    await expect(services.sessions.connect(connection)).rejects.toThrow(/ECONNREFUSED/)
    expect(services.sessions.state('local')).toMatchObject({ status: ConnectionStatus.Failed })
  })
})
