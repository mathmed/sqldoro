import type { EngineOption } from '../engine/engine.ts'
import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  DEFAULT_SSL,
  SshAuthMethod,
  type SshTunnelOptions,
  SslMode,
  type SslOptions,
} from './connection.ts'
import { ConnectionField } from './validation.ts'

// How a connection reaches its server: straight, or through an SSH tunnel that logs in with a
// password or a private key.
export const TunnelChoice = { None: 'none', ...SshAuthMethod } as const

export type TunnelChoice = (typeof TunnelChoice)[keyof typeof TunnelChoice]

// The fields that hold the path of a file: certificates and keys.
export const PathField = {
  SslCa: ConnectionField.SslCaPath,
  SslCert: ConnectionField.SslCertPath,
  SslKey: ConnectionField.SslKeyPath,
  SshPrivateKey: ConnectionField.SshPrivateKeyPath,
} as const

export type PathField = (typeof PathField)[keyof typeof PathField]

interface PathAccess {
  readonly read: (connection: ConnectionConfig) => string
  readonly write: (connection: ConnectionConfig, path: string) => ConnectionConfig
}

const PATH_FIELDS: ReadonlySet<string> = new Set(Object.values(PathField))

export function isPathField(value: unknown): value is PathField {
  return typeof value === 'string' && PATH_FIELDS.has(value)
}

export function withSsl(
  connection: ConnectionConfig,
  changes: Partial<SslOptions>,
): ConnectionConfig {
  return { ...connection, ssl: { ...connection.ssl, ...changes } }
}

// Turning SSL off forgets its files; the verify modes always reject unauthorized certificates.
export function withSslMode(connection: ConnectionConfig, mode: SslMode): ConnectionConfig {
  if (mode === SslMode.Disable) {
    return { ...connection, ssl: DEFAULT_SSL }
  }
  return withSsl(
    connection,
    mode === SslMode.Require ? { mode } : { mode, shouldRejectUnauthorized: true },
  )
}

// The tunnel fields only show with a tunnel; a new tunnel starts from the defaults.
export function sshOf(connection: ConnectionConfig): SshTunnelOptions {
  return connection.ssh ?? DEFAULT_SSH_TUNNEL
}

export function withSsh(
  connection: ConnectionConfig,
  changes: Partial<SshTunnelOptions>,
): ConnectionConfig {
  return { ...connection, ssh: { ...sshOf(connection), ...changes } }
}

export function tunnelChoiceOf(connection: ConnectionConfig): TunnelChoice {
  return connection.ssh?.authMethod ?? TunnelChoice.None
}

// No tunnel forgets the tunnel; another method keeps the server, the port and the user.
export function withTunnel(connection: ConnectionConfig, choice: TunnelChoice): ConnectionConfig {
  return choice === TunnelChoice.None
    ? { ...connection, ssh: undefined }
    : withSsh(connection, { authMethod: choice })
}

// A new engine brings its default port unless the user picked another one.
export function withEngine(
  connection: ConnectionConfig,
  engine: EngineOption,
  engines: readonly EngineOption[],
): ConnectionConfig {
  const current = engines.find((option) => option.id === connection.engine)
  const port = current?.defaultPort === connection.port ? engine.defaultPort : connection.port
  return { ...connection, engine: engine.id, port }
}

// What a connection string says replaces the server, the login, the database and SSL; the name once
// typed, the environment, the read-only switch and the tunnel stay as the user set them.
export function withImported(
  connection: ConnectionConfig,
  imported: ConnectionConfig,
): ConnectionConfig {
  const { engine, host, port, user, database, ssl } = imported
  const name = connection.name.trim() === '' ? imported.name : connection.name
  return { ...connection, name, engine, host, port, user, database, ssl }
}

export function pathOf(connection: ConnectionConfig, field: PathField): string {
  return accessOf(field).read(connection)
}

// An empty path removes the file.
export function withPath(
  connection: ConnectionConfig,
  field: PathField,
  path: string,
): ConnectionConfig {
  return accessOf(field).write(connection, path)
}

function accessOf(field: PathField): PathAccess {
  switch (field) {
    case PathField.SslCa:
      return {
        read: ({ ssl }) => ssl.caPath,
        write: (connection, caPath) => withSsl(connection, { caPath }),
      }
    case PathField.SslCert:
      return {
        read: ({ ssl }) => ssl.certPath,
        write: (connection, certPath) => withSsl(connection, { certPath }),
      }
    case PathField.SslKey:
      return {
        read: ({ ssl }) => ssl.keyPath,
        write: (connection, keyPath) => withSsl(connection, { keyPath }),
      }
    case PathField.SshPrivateKey:
      return {
        read: (connection) => sshOf(connection).privateKeyPath,
        write: (connection, privateKeyPath) => withSsh(connection, { privateKeyPath }),
      }
  }
}
