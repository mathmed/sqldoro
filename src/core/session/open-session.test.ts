import { describe, expect, it, vi } from 'vitest'

import { fakeEngine, fakeSession } from '../../../test/fakes/engine.ts'
import { fakeTunnel, fakeTunnelOpener, TUNNEL_ENDPOINT } from '../../../test/fakes/tunnel.ts'
import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  DEFAULT_SSL,
  newConnection,
  SshAuthMethod,
  SslMode,
} from '../connection/connection.ts'
import { type ConnectionSecrets, SecretKind } from '../connection/secrets.ts'
import { EngineRegistry } from '../engine/engine-registry.ts'
import type { EngineSession } from '../engine/engine.ts'
import type { FileReader } from '../platform.ts'
import { openSession, type SessionDependencies, type SessionRequest } from './open-session.ts'

const CONNECTION: ConnectionConfig = {
  ...newConnection('id', fakeEngine({ id: 'fake' })),
  host: 'db.internal',
  port: 5432,
  user: 'app',
  database: 'shop',
}
const SSH_TUNNEL = { ...DEFAULT_SSH_TUNNEL, host: 'bastion', port: 2222, user: 'ops' }
const SECRETS: ConnectionSecrets = new Map([
  [SecretKind.Password, 'db-pass'],
  [SecretKind.SshPassword, 'ssh-pass'],
  [SecretKind.SshPassphrase, 'key-pass'],
])
const FILES: FileReader = { readText: async (path) => Promise.resolve(`contents of ${path}`) }
const ANY_FUNCTION: unknown = expect.any(Function)

interface Setup {
  readonly engine: ReturnType<typeof fakeEngine>
  readonly tunnels: ReturnType<typeof fakeTunnelOpener>
  readonly dependencies: SessionDependencies
}

function setup({
  session = fakeSession(),
  ...overrides
}: Partial<SessionDependencies> & { session?: EngineSession } = {}): Setup {
  const engine = fakeEngine({ connect: async () => Promise.resolve(session) })
  const tunnels = fakeTunnelOpener()
  const dependencies: SessionDependencies = {
    engines: new EngineRegistry([engine]),
    tunnels,
    files: FILES,
    verifyHostKey: async () => Promise.resolve(true),
    ...overrides,
  }
  return { engine, tunnels, dependencies }
}

async function noop(): Promise<void> {
  return Promise.resolve()
}

function recordClose(order: string[], name: string): () => Promise<void> {
  return async () => {
    order.push(name)
    return Promise.resolve()
  }
}

function request(
  connection: Partial<ConnectionConfig> = {},
  extra: Partial<SessionRequest> = {},
): SessionRequest {
  return {
    connection: { ...CONNECTION, ...connection },
    secrets: SECRETS,
    onUnexpectedClose: vi.fn(),
    ...extra,
  }
}

describe('openSession', () => {
  it('should connect straight to the database without a tunnel', async () => {
    const { engine, tunnels, dependencies } = setup()

    const sut = await openSession(dependencies, request())

    expect(sut.engine.id).toBe('fake')
    expect(tunnels.requests).toHaveLength(0)
    expect(engine.requests).toStrictEqual([
      {
        endpoint: { host: 'db.internal', port: 5432 },
        user: 'app',
        password: 'db-pass',
        database: 'shop',
        tls: undefined,
        isReadOnly: true,
        onUnexpectedClose: ANY_FUNCTION,
      },
    ])
  })

  it('should ask the engine for sessions that refuse writes only on read-only connections', async () => {
    const { engine, dependencies } = setup()

    await openSession(dependencies, request({ isReadOnly: false }))

    expect(engine.requests[0]?.isReadOnly).toBe(false)
  })

  it('should hand the session of the engine', async () => {
    const session = fakeSession({ serverVersion: '18.0' })
    const { dependencies } = setup({ session })

    await expect(openSession(dependencies, request())).resolves.toMatchObject({
      engineSession: session,
    })
  })

  it('should send an empty password when none is stored', async () => {
    const { engine, dependencies } = setup()

    await openSession(dependencies, { ...request(), secrets: new Map() })

    expect(engine.requests[0]?.password).toBe('')
  })

  it('should refuse an engine that is not registered', async () => {
    const { dependencies } = setup()

    await expect(openSession(dependencies, request({ engine: 'oracle' }))).rejects.toThrow(
      'Unknown database engine "oracle"',
    )
  })

  it('should check certificates against the database host', async () => {
    const { engine, dependencies } = setup()
    const ssl = { ...DEFAULT_SSL, mode: SslMode.VerifyFull, caPath: '/ca.pem' }

    await openSession(dependencies, request({ ssl }))

    expect(engine.requests[0]?.tls).toStrictEqual({
      serverName: 'db.internal',
      shouldVerifyCertificate: true,
      shouldVerifyHostname: true,
      ca: 'contents of /ca.pem',
      cert: undefined,
      key: undefined,
    })
  })

  it('should not open the tunnel when a certificate file cannot be read', async () => {
    const files = { readText: async () => Promise.reject(new Error('ENOENT')) }
    const { tunnels, dependencies } = setup({ files })
    const ssl = { ...DEFAULT_SSL, mode: SslMode.Require, caPath: '/ca.pem' }

    await expect(openSession(dependencies, request({ ssl, ssh: SSH_TUNNEL }))).rejects.toThrow(
      'Could not read the CA certificate file "/ca.pem": ENOENT',
    )
    expect(tunnels.requests).toHaveLength(0)
  })

  describe('through an SSH tunnel', () => {
    it('should log in with the SSH password and reach the database through the tunnel', async () => {
      const { engine, tunnels, dependencies } = setup()
      const ssl = { ...DEFAULT_SSL, mode: SslMode.VerifyFull }

      await openSession(dependencies, request({ ssh: SSH_TUNNEL, ssl }))

      expect(tunnels.requests).toStrictEqual([
        {
          server: { host: 'bastion', port: 2222 },
          user: 'ops',
          credentials: { method: SshAuthMethod.Password, password: 'ssh-pass' },
          target: { host: 'db.internal', port: 5432 },
          verifyHostKey: ANY_FUNCTION,
          onUnexpectedClose: ANY_FUNCTION,
        },
      ])
      expect(engine.requests[0]).toMatchObject({
        endpoint: TUNNEL_ENDPOINT,
        tls: { serverName: 'db.internal' },
      })
    })

    it('should log in with the private key and its passphrase', async () => {
      const { tunnels, dependencies } = setup()
      const ssh = {
        ...SSH_TUNNEL,
        authMethod: SshAuthMethod.PrivateKey,
        privateKeyPath: '/id_ed25519',
      }

      await openSession(dependencies, request({ ssh }))

      expect(tunnels.requests[0]?.credentials).toStrictEqual({
        method: SshAuthMethod.PrivateKey,
        privateKey: 'contents of /id_ed25519',
        passphrase: 'key-pass',
      })
    })

    it('should say when the private key cannot be read', async () => {
      const files = { readText: async () => Promise.reject(new Error('EACCES')) }
      const { tunnels, dependencies } = setup({ files })
      const ssh = { ...SSH_TUNNEL, authMethod: SshAuthMethod.PrivateKey, privateKeyPath: '/id' }

      await expect(openSession(dependencies, request({ ssh }))).rejects.toThrow(
        'Could not read the SSH private key file "/id": EACCES',
      )
      expect(tunnels.requests).toHaveLength(0)
    })

    it('should ask about the host key of the SSH server', async () => {
      const verifyHostKey = vi.fn(async () => Promise.resolve(false))
      const { tunnels, dependencies } = setup({ verifyHostKey })
      await openSession(dependencies, request({ ssh: SSH_TUNNEL }))

      await expect(tunnels.requests[0]?.verifyHostKey('SHA256:abc')).resolves.toBe(false)
      expect(verifyHostKey).toHaveBeenCalledExactlyOnceWith({
        host: 'bastion',
        port: 2222,
        fingerprint: 'SHA256:abc',
      })
    })

    it('should close the tunnel when the database refuses the connection', async () => {
      const refusal = new Error('password authentication failed')
      const engine = fakeEngine({ connect: async () => Promise.reject(refusal) })
      const { tunnels, dependencies } = setup({ engines: new EngineRegistry([engine]) })
      const onUnexpectedClose = vi.fn()

      await expect(
        openSession(dependencies, request({ ssh: SSH_TUNNEL }, { onUnexpectedClose })),
      ).rejects.toBe(refusal)
      tunnels.requests[0]?.onUnexpectedClose(new Error('tunnel closed'))

      expect(tunnels.closeCount()).toBe(1)
      expect(onUnexpectedClose).not.toHaveBeenCalled()
    })

    it('should explain that the SSH server could not reach the database', async () => {
      const lost = new Error('Connection terminated unexpectedly')
      const engine = fakeEngine({ connect: async () => Promise.reject(lost) })
      const refused = new Error('(SSH) Channel open failure: Connection refused')
      const tunnels = fakeTunnelOpener(async () => Promise.resolve(fakeTunnel(noop, refused)))
      const { dependencies } = setup({ engines: new EngineRegistry([engine]), tunnels })

      const sut = openSession(dependencies, request({ ssh: SSH_TUNNEL }))

      await expect(sut).rejects.toThrow(
        'The SSH server could not reach db.internal:5432: (SSH) Channel open failure: Connection refused',
      )
      await expect(sut).rejects.toHaveProperty('cause', lost)
    })

    it('should close the database session, then the tunnel', async () => {
      const order: string[] = []
      const session = fakeSession({ close: recordClose(order, 'database') })
      const tunnels = fakeTunnelOpener(async () =>
        Promise.resolve(fakeTunnel(recordClose(order, 'tunnel'))),
      )
      const { dependencies } = setup({ session, tunnels })
      const sut = await openSession(dependencies, request({ ssh: SSH_TUNNEL }))

      await sut.close()

      expect(order).toStrictEqual(['database', 'tunnel'])
    })

    it('should close the tunnel even when the database session fails to close', async () => {
      const session = fakeSession({
        close: async () => Promise.reject(new Error('socket hang up')),
      })
      const { tunnels, dependencies } = setup({ session })
      const sut = await openSession(dependencies, request({ ssh: SSH_TUNNEL }))

      await expect(sut.close()).rejects.toThrow('socket hang up')
      expect(tunnels.closeCount()).toBe(1)
    })
  })

  describe('close', () => {
    it('should tear the session down only once', async () => {
      const close = vi.fn(async () => Promise.resolve())
      const { tunnels, dependencies } = setup({ session: fakeSession({ close }) })
      const sut = await openSession(dependencies, request({ ssh: SSH_TUNNEL }))

      await Promise.all([sut.close(), sut.close()])
      await sut.close()

      expect(close).toHaveBeenCalledOnce()
      expect(tunnels.closeCount()).toBe(1)
    })

    it('should close a session without a tunnel', async () => {
      const close = vi.fn(async () => Promise.resolve())
      const { dependencies } = setup({ session: fakeSession({ close }) })
      const sut = await openSession(dependencies, request())

      await sut.close()

      expect(close).toHaveBeenCalledOnce()
    })
  })

  describe('unexpected end', () => {
    it('should report the first unexpected end only', async () => {
      const { engine, tunnels, dependencies } = setup()
      const onUnexpectedClose = vi.fn()
      await openSession(dependencies, request({ ssh: SSH_TUNNEL }, { onUnexpectedClose }))
      const lost = new Error('server closed the connection')

      engine.requests[0]?.onUnexpectedClose(lost)
      tunnels.requests[0]?.onUnexpectedClose(new Error('tunnel closed'))

      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(lost)
    })

    it('should not report an end that close() caused', async () => {
      const { engine, dependencies } = setup()
      const onUnexpectedClose = vi.fn()
      const sut = await openSession(dependencies, request({}, { onUnexpectedClose }))

      await sut.close()
      engine.requests[0]?.onUnexpectedClose(new Error('connection ended'))

      expect(onUnexpectedClose).not.toHaveBeenCalled()
    })
  })
})
