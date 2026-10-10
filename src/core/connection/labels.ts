import { EnvironmentTag, SshAuthMethod, SslMode } from './connection.ts'
import { ConnectionField } from './validation.ts'

// What people read for each stored value, in the extension and in the connection form. Unknown
// values are shown as they are.
export const ENVIRONMENT_LABELS: ReadonlyMap<string, string> = new Map([
  [EnvironmentTag.None, 'None'],
  [EnvironmentTag.Local, 'Local'],
  [EnvironmentTag.Development, 'Development'],
  [EnvironmentTag.Staging, 'Staging'],
  [EnvironmentTag.Production, 'Production'],
])

export const SSL_MODE_LABELS: ReadonlyMap<string, string> = new Map([
  [SslMode.Disable, 'Disabled'],
  [SslMode.Require, 'Required'],
  [SslMode.VerifyCa, 'Verify CA'],
  [SslMode.VerifyFull, 'Verify full'],
])

export const SSL_MODE_DETAILS: ReadonlyMap<string, string> = new Map([
  [SslMode.Disable, 'Plain connection, nothing is encrypted'],
  [SslMode.Require, 'Encrypted; the certificate is checked unless you accept unauthorized ones'],
  [SslMode.VerifyCa, 'Encrypted; the certificate must be signed by a trusted CA'],
  [SslMode.VerifyFull, 'Encrypted; the certificate must be trusted and name the host'],
])

export const SSH_AUTH_LABELS: ReadonlyMap<string, string> = new Map([
  [SshAuthMethod.Password, 'Password'],
  [SshAuthMethod.PrivateKey, 'Private key'],
])

// The name of each field of a connection, as the form labels it.
export const FIELD_LABELS: ReadonlyMap<string, string> = new Map([
  [ConnectionField.Name, 'Name'],
  [ConnectionField.Engine, 'Server type'],
  [ConnectionField.Host, 'Host'],
  [ConnectionField.Port, 'Port'],
  [ConnectionField.User, 'Username'],
  [ConnectionField.Database, 'Database'],
  [ConnectionField.SslMode, 'SSL mode'],
  [ConnectionField.SslCaPath, 'CA certificate'],
  [ConnectionField.SslCertPath, 'Client certificate'],
  [ConnectionField.SslKeyPath, 'Client key'],
  [ConnectionField.SshHost, 'SSH host'],
  [ConnectionField.SshPort, 'SSH port'],
  [ConnectionField.SshUser, 'SSH user'],
  [ConnectionField.SshPrivateKeyPath, 'Private key'],
])

export function labelOf(labels: ReadonlyMap<string, string>, value: string): string {
  return labels.get(value) ?? value
}
