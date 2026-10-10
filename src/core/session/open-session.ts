import {
  type ConnectionConfig,
  SshAuthMethod,
  type SshTunnelOptions,
} from '../connection/connection.ts'
import { type ConnectionSecrets, SecretKind, secretOf } from '../connection/secrets.ts'
import { resolveTls } from '../connection/tls.ts'
import { ConnectionWatch } from '../engine/connection-watch.ts'
import type { EngineRegistry } from '../engine/engine-registry.ts'
import type { Engine, EngineSession } from '../engine/engine.ts'
import { type FileReader, readFileFor } from '../platform.ts'
import { describeError } from '../text/errors.ts'
import type { HostKeyCheck } from './host-key.ts'
import type { SshCredentials, Tunnel, TunnelOpener } from './tunnel.ts'

export interface SessionDependencies {
  readonly engines: EngineRegistry
  readonly tunnels: TunnelOpener
  readonly files: FileReader
  readonly verifyHostKey: (check: HostKeyCheck) => Promise<boolean>
}

export interface SessionRequest {
  readonly connection: ConnectionConfig
  readonly secrets: ConnectionSecrets
  // Called at most once, when the database or the tunnel ends without close().
  readonly onUnexpectedClose: (error: Error) => void
}

export interface Session {
  readonly engine: Engine
  readonly engineSession: EngineSession
  // Idempotent: every call waits for the same teardown.
  readonly close: () => Promise<void>
}

export async function openSession(
  dependencies: SessionDependencies,
  request: SessionRequest,
): Promise<Session> {
  const { connection, secrets } = request
  const engine = dependencies.engines.get(connection.engine)
  const tls = await resolveTls(connection.ssl, connection.host, dependencies.files)
  const watch = new ConnectionWatch(request.onUnexpectedClose)
  const tunnel = await openTunnel(dependencies, request, watch)
  try {
    const engineSession = await engine.connect({
      endpoint: tunnel?.endpoint ?? { host: connection.host, port: connection.port },
      user: connection.user,
      password: secretOf(secrets, SecretKind.Password),
      database: connection.database,
      tls,
      onUnexpectedClose: watch.report,
    })
    return { engine, engineSession, close: closer(engineSession, tunnel, watch) }
  } catch (error) {
    watch.close()
    await tunnel?.close()
    throw explainedThroughTunnel(error, tunnel, connection)
  }
}

function explainedThroughTunnel(
  error: unknown,
  tunnel: Tunnel | undefined,
  { host, port }: ConnectionConfig,
): unknown {
  const forwardingError = tunnel?.forwardingError()
  if (forwardingError === undefined) {
    return error
  }
  const reason = describeError(forwardingError)
  return new Error(`The SSH server could not reach ${host}:${String(port)}: ${reason}`, {
    cause: error,
  })
}

async function openTunnel(
  dependencies: SessionDependencies,
  { connection, secrets }: SessionRequest,
  watch: ConnectionWatch,
): Promise<Tunnel | undefined> {
  const { ssh } = connection
  if (ssh === undefined) {
    return undefined
  }
  return dependencies.tunnels.open({
    server: { host: ssh.host, port: ssh.port },
    user: ssh.user,
    credentials: await credentialsOf(ssh, secrets, dependencies.files),
    target: { host: connection.host, port: connection.port },
    verifyHostKey: async (fingerprint) =>
      dependencies.verifyHostKey({ host: ssh.host, port: ssh.port, fingerprint }),
    onUnexpectedClose: watch.report,
  })
}

async function credentialsOf(
  ssh: SshTunnelOptions,
  secrets: ConnectionSecrets,
  files: FileReader,
): Promise<SshCredentials> {
  if (ssh.authMethod === SshAuthMethod.Password) {
    return { method: ssh.authMethod, password: secretOf(secrets, SecretKind.SshPassword) }
  }
  return {
    method: ssh.authMethod,
    privateKey: await readFileFor(files, ssh.privateKeyPath, 'SSH private key'),
    passphrase: secretOf(secrets, SecretKind.SshPassphrase),
  }
}

function closer(
  engineSession: EngineSession,
  tunnel: Tunnel | undefined,
  watch: ConnectionWatch,
): () => Promise<void> {
  let closing: Promise<void> | undefined
  return async () => {
    watch.close()
    closing ??= closeAll(engineSession, tunnel)
    return closing
  }
}

async function closeAll(engineSession: EngineSession, tunnel: Tunnel | undefined): Promise<void> {
  try {
    await engineSession.close()
  } finally {
    await tunnel?.close()
  }
}
