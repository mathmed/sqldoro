// The whole connection path outside VS Code: openSession, the ssh2 tunnel through a real OpenSSH
// server, and the MySQL and PostgreSQL drivers on the other side.
import { connect } from 'node:net'

import { Client, utils } from 'ssh2'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  newConnection,
  SshAuthMethod,
} from '../../src/core/connection/connection.ts'
import { SecretKind } from '../../src/core/connection/secrets.ts'
import { EngineRegistry } from '../../src/core/engine/engine-registry.ts'
import type { Engine } from '../../src/core/engine/engine.ts'
import type { HostKeyCheck } from '../../src/core/session/host-key.ts'
import { openSession, type SessionDependencies } from '../../src/core/session/open-session.ts'
import type { Tunnel } from '../../src/core/session/tunnel.ts'
import { mysqlEngine } from '../../src/drivers/mysql/mysql-engine.ts'
import { postgresEngine } from '../../src/drivers/postgres/postgres-engine.ts'
import { SshTunnelOpener } from '../../src/tunnel/ssh-tunnel.ts'
import { recordingLogger } from '../fakes/logger.ts'
import { queryRequest } from '../fakes/query-request.ts'
import { type DatabaseServer, MYSQL, POSTGRES, SSH, waitUntilReady } from './servers.ts'

const KEY_PATH = '/keys/id_ed25519'
const KEY_PASSPHRASE = 'it-passphrase'
const CLIENT_KEYS = utils.generateKeyPairSync('ed25519', {
  passphrase: KEY_PASSPHRASE,
  cipher: 'aes256-ctr',
  // One bcrypt round keeps the test fast; real keys use more, the parsing is the same.
  rounds: 1,
})
const LOG = recordingLogger()

let serverFingerprint: string

// Runs a command on the SSH server with the password: test setup only.
async function runOnServer(command: string): Promise<string> {
  const client = new Client()
  return new Promise((resolve, reject) => {
    client.on('error', reject)
    client.on('ready', () => {
      client.exec(command, (error, stream) => {
        if (error !== undefined) {
          reject(error)
          return
        }
        let output = ''
        stream.on('data', (chunk: Buffer) => (output += chunk.toString()))
        stream.on('close', () => {
          client.end()
          resolve(output)
        })
      })
    })
    client.connect({ ...SSH.endpoint, username: SSH.user, password: SSH.password })
  })
}

function connectionTo(
  engine: Engine,
  server: DatabaseServer,
  changes: Partial<ConnectionConfig> = {},
): ConnectionConfig {
  return {
    ...newConnection('it', engine),
    name: `${engine.id} through SSH`,
    host: server.internal.host,
    port: server.internal.port,
    user: server.user,
    database: server.database,
    ssh: {
      ...DEFAULT_SSH_TUNNEL,
      host: SSH.endpoint.host,
      port: SSH.endpoint.port,
      user: SSH.user,
    },
    ...changes,
  }
}

interface Dependencies {
  readonly sessionDependencies: SessionDependencies
  readonly tunnels: readonly Tunnel[]
}

const TRUST_EVERY_HOST = async (): Promise<boolean> => Promise.resolve(true)

function dependencies(
  verifyHostKey: (check: HostKeyCheck) => Promise<boolean> = TRUST_EVERY_HOST,
): Dependencies {
  const opener = new SshTunnelOpener(LOG)
  const tunnels: Tunnel[] = []
  const sessionDependencies: SessionDependencies = {
    engines: new EngineRegistry([mysqlEngine, postgresEngine]),
    tunnels: {
      open: async (request) => {
        const tunnel = await opener.open(request)
        tunnels.push(tunnel)
        return tunnel
      },
    },
    files: {
      readText: async (path) =>
        path === KEY_PATH ? CLIENT_KEYS.private : Promise.reject(new Error('ENOENT')),
    },
    verifyHostKey,
  }
  return { sessionDependencies, tunnels }
}

async function isRefused(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      resolve(true)
    })
  })
}

const PASSWORD_SECRETS = (server: DatabaseServer): ReadonlyMap<SecretKind, string> =>
  new Map([
    [SecretKind.Password, server.password],
    [SecretKind.SshPassword, SSH.password],
  ])

describe('connections through a real OpenSSH server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      await runOnServer('true')
    })
    const publicKey = CLIENT_KEYS.public.trim()
    await runOnServer(
      `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`,
    )
    serverFingerprint =
      (await runOnServer('ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub')).split(' ')[1] ?? ''
  })

  it('should reach MySQL with the SSH password and release the tunnel on close', async () => {
    const { sessionDependencies, tunnels } = dependencies()
    const session = await openSession(sessionDependencies, {
      connection: connectionTo(mysqlEngine, MYSQL),
      secrets: PASSWORD_SECRETS(MYSQL),
      onUnexpectedClose: vi.fn(),
    })

    const result = await session.engineSession.execute(
      queryRequest({
        sql: 'SELECT 1 + 1 AS two',
        maxRows: 1,
        onRows: () => undefined,
      }),
    ).result
    await session.close()

    expect(result.rows).toStrictEqual([['2']])
    await expect(isRefused(tunnels[0]?.endpoint.port ?? 0)).resolves.toBe(true)
  })

  it('should reach PostgreSQL with an encrypted private key', async () => {
    const { sessionDependencies } = dependencies()
    const ssh = {
      ...DEFAULT_SSH_TUNNEL,
      host: SSH.endpoint.host,
      port: SSH.endpoint.port,
      user: SSH.user,
      authMethod: SshAuthMethod.PrivateKey,
      privateKeyPath: KEY_PATH,
    }
    const session = await openSession(sessionDependencies, {
      connection: connectionTo(postgresEngine, POSTGRES, { ssh }),
      secrets: new Map([
        [SecretKind.Password, POSTGRES.password],
        [SecretKind.SshPassphrase, KEY_PASSPHRASE],
      ]),
      onUnexpectedClose: vi.fn(),
    })

    await expect(session.engineSession.listDatabases()).resolves.toContainEqual({
      name: POSTGRES.database,
    })
    await session.close()
  })

  it('should show the fingerprint OpenSSH computes for its host key', async () => {
    const verifyHostKey = vi.fn(async () => Promise.resolve(true))
    const { sessionDependencies } = dependencies(verifyHostKey)

    const session = await openSession(sessionDependencies, {
      connection: connectionTo(mysqlEngine, MYSQL),
      secrets: PASSWORD_SECRETS(MYSQL),
      onUnexpectedClose: vi.fn(),
    })
    await session.close()

    expect(serverFingerprint).toMatch(/^SHA256:/)
    expect(verifyHostKey).toHaveBeenCalledExactlyOnceWith({
      host: SSH.endpoint.host,
      port: SSH.endpoint.port,
      fingerprint: serverFingerprint,
    })
  })

  it('should refuse a host key the user does not trust', async () => {
    const { sessionDependencies } = dependencies(async () => Promise.resolve(false))

    await expect(
      openSession(sessionDependencies, {
        connection: connectionTo(mysqlEngine, MYSQL),
        secrets: PASSWORD_SECRETS(MYSQL),
        onUnexpectedClose: vi.fn(),
      }),
    ).rejects.toThrow(`the host key ${serverFingerprint} was not trusted`)
  })

  it('should explain a wrong SSH password', async () => {
    const { sessionDependencies } = dependencies()

    await expect(
      openSession(sessionDependencies, {
        connection: connectionTo(mysqlEngine, MYSQL),
        secrets: new Map([[SecretKind.SshPassword, 'wrong']]),
        onUnexpectedClose: vi.fn(),
      }),
    ).rejects.toThrow('All configured authentication methods failed')
  })

  it('should explain that the SSH server cannot reach the database', async () => {
    const { sessionDependencies, tunnels } = dependencies()

    await expect(
      openSession(sessionDependencies, {
        connection: connectionTo(postgresEngine, POSTGRES, { port: 1 }),
        secrets: PASSWORD_SECRETS(POSTGRES),
        onUnexpectedClose: vi.fn(),
      }),
    ).rejects.toThrow(`The SSH server could not reach ${POSTGRES.internal.host}:1:`)
    await expect(isRefused(tunnels[0]?.endpoint.port ?? 0)).resolves.toBe(true)
  })
})
