import { describe, expect, it } from 'vitest'

import { EnvironmentTag, SshAuthMethod, SslMode } from './connection.ts'
import {
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
