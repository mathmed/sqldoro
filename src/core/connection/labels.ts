import { ConnectionColor, EnvironmentTag, SshAuthMethod, SslMode } from './connection.ts'
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

// The short names the connection form offers the environments under.
export const ENVIRONMENT_SHORT_LABELS: ReadonlyMap<string, string> = new Map([
  [EnvironmentTag.None, 'None'],
  [EnvironmentTag.Local, 'Local'],
  [EnvironmentTag.Development, 'Dev'],
  [EnvironmentTag.Staging, 'Staging'],
  [EnvironmentTag.Production, 'Prod'],
])

// The theme color of each environment, by its VS Code id: production stands out in red; untagged
// connections keep the theme's color.
export const ENVIRONMENT_COLORS: ReadonlyMap<string, string> = new Map([
  [EnvironmentTag.Local, 'charts.green'],
  [EnvironmentTag.Development, 'charts.blue'],
  [EnvironmentTag.Staging, 'charts.orange'],
  [EnvironmentTag.Production, 'charts.red'],
])

// The theme color of each connection color, by its VS Code id, and how people call it.
export const CONNECTION_COLORS: ReadonlyMap<string, string> = new Map([
  [ConnectionColor.Red, 'charts.red'],
  [ConnectionColor.Orange, 'charts.orange'],
  [ConnectionColor.Yellow, 'charts.yellow'],
  [ConnectionColor.Green, 'charts.green'],
  [ConnectionColor.Blue, 'charts.blue'],
  [ConnectionColor.Purple, 'charts.purple'],
])

export const CONNECTION_COLOR_LABELS: ReadonlyMap<string, string> = new Map([
  [ConnectionColor.None, 'No color'],
  [ConnectionColor.Red, 'Red'],
  [ConnectionColor.Orange, 'Orange'],
  [ConnectionColor.Yellow, 'Yellow'],
  [ConnectionColor.Green, 'Green'],
  [ConnectionColor.Blue, 'Blue'],
  [ConnectionColor.Purple, 'Purple'],
])

const PRODUCTION_COLOR = 'charts.red'

// The theme color a connection shows in (its icon, the badge of its editors and panels): red on
// production whatever else, then the color the user gave it, then the color of its environment;
// empty for none.
export function connectionTint(
  connection: { readonly color: string; readonly environment: string },
  isProduction: boolean,
): string {
  if (isProduction) {
    return PRODUCTION_COLOR
  }
  return (
    CONNECTION_COLORS.get(connection.color) ?? ENVIRONMENT_COLORS.get(connection.environment) ?? ''
  )
}

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
  [ConnectionField.Name, 'Connection name'],
  [ConnectionField.Engine, 'Server type'],
  [ConnectionField.Host, 'Host'],
  [ConnectionField.Port, 'Port'],
  [ConnectionField.User, 'Username'],
  [ConnectionField.Database, 'Database'],
  [ConnectionField.Folder, 'Folder'],
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
