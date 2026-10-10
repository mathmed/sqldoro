import type { EngineOption } from '../engine/engine.ts'
import {
  type ConnectionConfig,
  SshAuthMethod,
  type SshTunnelOptions,
  SslMode,
  type SslOptions,
} from './connection.ts'
import {
  validateDatabase,
  validateHost,
  validateName,
  validatePath,
  validatePort,
  validateUser,
} from './fields.ts'
import { nameKey } from './names.ts'

export const ConnectionField = {
  Name: 'name',
  Engine: 'engine',
  Host: 'host',
  Port: 'port',
  User: 'user',
  Database: 'database',
  SslMode: 'sslMode',
  SslCaPath: 'sslCaPath',
  SslCertPath: 'sslCertPath',
  SslKeyPath: 'sslKeyPath',
  SshHost: 'sshHost',
  SshPort: 'sshPort',
  SshUser: 'sshUser',
  SshPrivateKeyPath: 'sshPrivateKeyPath',
} as const

export type ConnectionField = (typeof ConnectionField)[keyof typeof ConnectionField]

export interface ValidationIssue {
  readonly field: ConnectionField
  readonly message: string
}

export interface ValidationContext {
  readonly engines: readonly EngineOption[]
  // Name keys (see nameKey) of the other connections.
  readonly takenNameKeys: ReadonlySet<string>
}

type Check = readonly [ConnectionField, string | undefined]

const VERIFY_MODES: ReadonlySet<SslMode> = new Set([SslMode.VerifyCa, SslMode.VerifyFull])

export function validateConnection(
  connection: ConnectionConfig,
  context: ValidationContext,
): readonly ValidationIssue[] {
  const checks: Check[] = [
    [ConnectionField.Name, validateName(connection.name) ?? nameConflict(connection.name, context)],
    [ConnectionField.Engine, engineProblem(connection.engine, context.engines)],
    [ConnectionField.Host, validateHost(connection.host)],
    [ConnectionField.Port, validatePort(connection.port)],
    [ConnectionField.User, validateUser(connection.user)],
    [ConnectionField.Database, validateDatabase(connection.database)],
    ...sslChecks(connection.ssl),
    ...sshChecks(connection.ssh),
  ]
  return checks.flatMap(([field, message]) => (message === undefined ? [] : [{ field, message }]))
}

function nameConflict(name: string, context: ValidationContext): string | undefined {
  return context.takenNameKeys.has(nameKey(name))
    ? `Another connection is already named "${name.trim()}"`
    : undefined
}

function engineProblem(engine: string, engines: readonly EngineOption[]): string | undefined {
  return engines.some((option) => option.id === engine)
    ? undefined
    : `Unknown database engine "${engine}"`
}

function sslChecks(ssl: SslOptions): Check[] {
  return [
    [ConnectionField.SslMode, sslModeProblem(ssl)],
    [ConnectionField.SslCaPath, validatePath(ssl.caPath)],
    [
      ConnectionField.SslCertPath,
      validatePath(ssl.certPath) ??
        pairProblem(ssl.keyPath, ssl.certPath, 'A client key needs its certificate'),
    ],
    [
      ConnectionField.SslKeyPath,
      validatePath(ssl.keyPath) ??
        pairProblem(ssl.certPath, ssl.keyPath, 'A client certificate needs its private key'),
    ],
  ]
}

function sslModeProblem(ssl: SslOptions): string | undefined {
  if (ssl.mode === SslMode.Disable) {
    return hasCertificateFiles(ssl) ? 'Choose an SSL mode to use certificate files' : undefined
  }
  if (VERIFY_MODES.has(ssl.mode) && !ssl.shouldRejectUnauthorized) {
    return 'verify-ca and verify-full always reject unauthorized certificates'
  }
  return undefined
}

function hasCertificateFiles(ssl: SslOptions): boolean {
  return [ssl.caPath, ssl.certPath, ssl.keyPath].some((path) => path !== '')
}

function pairProblem(present: string, missing: string, message: string): string | undefined {
  return present !== '' && missing === '' ? message : undefined
}

function sshChecks(ssh: SshTunnelOptions | undefined): Check[] {
  if (ssh === undefined) {
    return []
  }
  return [
    [ConnectionField.SshHost, validateHost(ssh.host)],
    [ConnectionField.SshPort, validatePort(ssh.port)],
    [ConnectionField.SshUser, ssh.user === '' ? 'Enter the SSH user' : validateUser(ssh.user)],
    [ConnectionField.SshPrivateKeyPath, privateKeyProblem(ssh)],
  ]
}

function privateKeyProblem(ssh: SshTunnelOptions): string | undefined {
  if (ssh.authMethod === SshAuthMethod.Password) {
    return undefined
  }
  return ssh.privateKeyPath === ''
    ? 'Choose the private key file'
    : validatePath(ssh.privateKeyPath)
}
