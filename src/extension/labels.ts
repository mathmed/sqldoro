import * as vscode from 'vscode'

import { EnvironmentTag, SshAuthMethod, SslMode } from '../core/connection/connection.ts'

// What people read for each stored value. Unknown values are shown as they are.
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

// Production stands out in red; untagged connections keep the theme's color.
const ENVIRONMENT_COLORS: ReadonlyMap<string, string> = new Map([
  [EnvironmentTag.Local, 'charts.green'],
  [EnvironmentTag.Development, 'charts.blue'],
  [EnvironmentTag.Staging, 'charts.orange'],
  [EnvironmentTag.Production, 'charts.red'],
])

export function labelOf(labels: ReadonlyMap<string, string>, value: string): string {
  return labels.get(value) ?? value
}

export function environmentColor(tag: string): vscode.ThemeColor | undefined {
  const color = ENVIRONMENT_COLORS.get(tag)
  return color === undefined ? undefined : new vscode.ThemeColor(color)
}

// The badge shown next to a tagged connection, such as PROD.
export function environmentBadge(tag: string): string {
  return tag === EnvironmentTag.None ? '' : tag.toUpperCase()
}
