import { describe, expect, it } from 'vitest'

import { ConnectionColor, EnvironmentTag, SshAuthMethod, SslMode } from './connection.ts'
import {
  CONNECTION_COLOR_LABELS,
  CONNECTION_COLORS,
  connectionTint,
  ENVIRONMENT_COLORS,
  ENVIRONMENT_LABELS,
  ENVIRONMENT_SHORT_LABELS,
  FIELD_LABELS,
  labelOf,
  SSH_AUTH_LABELS,
  SSL_MODE_DETAILS,
  SSL_MODE_LABELS,
} from './labels.ts'
import { ConnectionField } from './validation.ts'

describe('labelOf', () => {
  it('should name each environment', () => {
    expect(
      Object.values(EnvironmentTag).map((tag) => labelOf(ENVIRONMENT_LABELS, tag)),
    ).toStrictEqual(['None', 'Local', 'Development', 'Staging', 'Production'])
  })

  it('should give each environment a short name and a color, none to an untagged one', () => {
    const tags = Object.values(EnvironmentTag)

    expect(tags.map((tag) => labelOf(ENVIRONMENT_SHORT_LABELS, tag))).toStrictEqual([
      'None',
      'Local',
      'Dev',
      'Staging',
      'Prod',
    ])
    expect(tags.map((tag) => ENVIRONMENT_COLORS.get(tag))).toStrictEqual([
      undefined,
      'charts.green',
      'charts.blue',
      'charts.orange',
      'charts.red',
    ])
  })

  it('should name each connection color and give it a theme color, none to no color', () => {
    const colors = Object.values(ConnectionColor)

    expect(colors.map((color) => labelOf(CONNECTION_COLOR_LABELS, color))).toStrictEqual([
      'No color',
      'Red',
      'Orange',
      'Yellow',
      'Green',
      'Blue',
      'Purple',
    ])
    expect(colors.map((color) => CONNECTION_COLORS.get(color))).toStrictEqual([
      undefined,
      'charts.red',
      'charts.orange',
      'charts.yellow',
      'charts.green',
      'charts.blue',
      'charts.purple',
    ])
  })

  it('should tint a connection red on production, then with its color or its environment', () => {
    expect(connectionTint({ color: 'blue', environment: 'local' }, true)).toBe('charts.red')
    expect(connectionTint({ color: 'blue', environment: 'local' }, false)).toBe('charts.blue')
    expect(connectionTint({ color: '', environment: 'local' }, false)).toBe('charts.green')
    expect(connectionTint({ color: '', environment: 'none' }, false)).toBe('')
  })

  it('should name and describe each SSL mode', () => {
    const modes = Object.values(SslMode)

    expect(modes.map((mode) => labelOf(SSL_MODE_LABELS, mode))).toStrictEqual([
      'Disabled',
      'Required',
      'Verify CA',
      'Verify full',
    ])
    expect(modes.map((mode) => labelOf(SSL_MODE_DETAILS, mode))).toStrictEqual([
      'Plain connection, nothing is encrypted',
      'Encrypted; the certificate is checked unless you accept unauthorized ones',
      'Encrypted; the certificate must be signed by a trusted CA',
      'Encrypted; the certificate must be trusted and name the host',
    ])
  })

  it('should name each SSH authentication method', () => {
    expect(
      Object.values(SshAuthMethod).map((method) => labelOf(SSH_AUTH_LABELS, method)),
    ).toStrictEqual(['Password', 'Private key'])
  })

  it('should name each field of a connection', () => {
    expect(
      Object.values(ConnectionField).map((field) => labelOf(FIELD_LABELS, field)),
    ).toStrictEqual([
      'Connection name',
      'Server type',
      'Host',
      'Port',
      'Username',
      'Database',
      'Folder',
      'SSL mode',
      'CA certificate',
      'Client certificate',
      'Client key',
      'SSH host',
      'SSH port',
      'SSH user',
      'Private key',
    ])
  })

  it('should show an unknown value as it is', () => {
    expect(labelOf(ENVIRONMENT_LABELS, 'qa')).toBe('qa')
  })
})
