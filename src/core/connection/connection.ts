import type { EngineDescriptor } from '../engine/engine.ts'
import { uniqueName } from './names.ts'

export const EnvironmentTag = {
  None: 'none',
  Local: 'local',
  Development: 'dev',
  Staging: 'staging',
  Production: 'prod',
} as const

export type EnvironmentTag = (typeof EnvironmentTag)[keyof typeof EnvironmentTag]

export const SslMode = {
  Disable: 'disable',
  Require: 'require',
  VerifyCa: 'verify-ca',
  VerifyFull: 'verify-full',
} as const

export type SslMode = (typeof SslMode)[keyof typeof SslMode]

export const SshAuthMethod = {
  Password: 'password',
  PrivateKey: 'private-key',
} as const

export type SshAuthMethod = (typeof SshAuthMethod)[keyof typeof SshAuthMethod]

// Paths are empty when not set. With `require`, `shouldRejectUnauthorized` decides whether the
// certificate must verify (chain and host name); the verify modes always reject.
export interface SslOptions {
  readonly mode: SslMode
  readonly caPath: string
  readonly certPath: string
  readonly keyPath: string
  readonly shouldRejectUnauthorized: boolean
}

export interface SshTunnelOptions {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly authMethod: SshAuthMethod
  // Empty unless authMethod is private-key.
  readonly privateKeyPath: string
}

// Everything about a connection except its secrets, which live in the platform's secret storage.
export interface ConnectionConfig {
  readonly id: string
  readonly name: string
  readonly engine: string
  readonly host: string
  readonly port: number
  readonly user: string
  // Empty for the default database of the engine.
  readonly database: string
  readonly ssl: SslOptions
  readonly ssh: SshTunnelOptions | undefined
  readonly environment: EnvironmentTag
  readonly isReadOnly: boolean
}

const DEFAULT_HOST = 'localhost'
const DEFAULT_SSH_PORT = 22

export const DEFAULT_SSL: SslOptions = {
  mode: SslMode.Disable,
  caPath: '',
  certPath: '',
  keyPath: '',
  shouldRejectUnauthorized: true,
}

export const DEFAULT_SSH_TUNNEL: SshTunnelOptions = {
  host: '',
  port: DEFAULT_SSH_PORT,
  user: '',
  authMethod: SshAuthMethod.Password,
  privateKeyPath: '',
}

const ENVIRONMENT_TAGS: ReadonlySet<string> = new Set(Object.values(EnvironmentTag))
const SSL_MODES: ReadonlySet<string> = new Set(Object.values(SslMode))
const SSH_AUTH_METHODS: ReadonlySet<string> = new Set(Object.values(SshAuthMethod))

export function isEnvironmentTag(value: unknown): value is EnvironmentTag {
  return typeof value === 'string' && ENVIRONMENT_TAGS.has(value)
}

export function isSslMode(value: unknown): value is SslMode {
  return typeof value === 'string' && SSL_MODES.has(value)
}

export function isSshAuthMethod(value: unknown): value is SshAuthMethod {
  return typeof value === 'string' && SSH_AUTH_METHODS.has(value)
}

// A new connection is read-only and untagged until the user decides otherwise.
export function newConnection(id: string, engine: EngineDescriptor): ConnectionConfig {
  return {
    id,
    name: '',
    engine: engine.id,
    host: DEFAULT_HOST,
    port: engine.defaultPort,
    user: '',
    database: '',
    ssl: DEFAULT_SSL,
    ssh: undefined,
    environment: EnvironmentTag.None,
    isReadOnly: true,
  }
}

export function duplicateConnection(
  source: ConnectionConfig,
  id: string,
  takenNameKeys: ReadonlySet<string>,
): ConnectionConfig {
  return { ...source, id, name: uniqueName(`${source.name} (copy)`, takenNameKeys) }
}

// Whether an edit changes how the connection reaches the database: the name, the tag and the
// read-only flag do not, so an open session can stay open.
export function changesSession(previous: ConnectionConfig, next: ConnectionConfig): boolean {
  return JSON.stringify(sessionFields(previous)) !== JSON.stringify(sessionFields(next))
}

function sessionFields(connection: ConnectionConfig): readonly unknown[] {
  const { engine, host, port, user, database, ssl, ssh } = connection
  return [engine, host, port, user, database, ssl, ssh ?? null]
}
