import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  DEFAULT_SSL,
  newConnection,
  SshAuthMethod,
  SslMode,
} from './connection.ts'
import {
  isPathField,
  PathField,
  pathOf,
  sshOf,
  TunnelChoice,
  tunnelChoiceOf,
  withEngine,
  withPath,
  withSsh,
  withSsl,
  withSslMode,
  withTunnel,
} from './transitions.ts'

const MYSQL = { id: 'mysql', displayName: 'MySQL', defaultPort: 3306 }
const POSTGRES = { id: 'postgres', displayName: 'PostgreSQL', defaultPort: 5432 }
const ENGINES = [MYSQL, POSTGRES]
const CONNECTION: ConnectionConfig = { ...newConnection('id', fakeEngine(POSTGRES)), name: 'Shop' }
const TUNNEL = { ...DEFAULT_SSH_TUNNEL, host: 'bastion', user: 'ops' }
const WITH_FILES = {
  ...CONNECTION,
  ssl: { ...DEFAULT_SSL, mode: SslMode.Require, caPath: '/ca', certPath: '/cert', keyPath: '/key' },
}

describe('withSsl', () => {
  it('should change only the given SSL options', () => {
    expect(withSsl(CONNECTION, { caPath: '/ca' }).ssl).toStrictEqual({
      ...DEFAULT_SSL,
      caPath: '/ca',
    })
  })
})

describe('withSslMode', () => {
  it('should forget the certificate files when SSL is turned off', () => {
    expect(withSslMode(WITH_FILES, SslMode.Disable).ssl).toBe(DEFAULT_SSL)
  })

  it('should keep the files and the choice about unauthorized certificates with require', () => {
    const accepting = { ...WITH_FILES, ssl: { ...WITH_FILES.ssl, shouldRejectUnauthorized: false } }
    const verifying = { ...WITH_FILES, ssl: { ...WITH_FILES.ssl, mode: SslMode.VerifyFull } }

    expect(withSslMode(accepting, SslMode.Require).ssl).toStrictEqual(accepting.ssl)
    expect(withSslMode(verifying, SslMode.Require).ssl).toStrictEqual({
      ...verifying.ssl,
      mode: SslMode.Require,
    })
  })

  it('should always reject unauthorized certificates with the verify modes', () => {
    const accepting = { ...WITH_FILES, ssl: { ...WITH_FILES.ssl, shouldRejectUnauthorized: false } }

    expect(withSslMode(accepting, SslMode.VerifyCa).ssl).toStrictEqual({
      ...WITH_FILES.ssl,
      mode: SslMode.VerifyCa,
      shouldRejectUnauthorized: true,
    })
    expect(withSslMode(accepting, SslMode.VerifyFull).ssl).toMatchObject({
      mode: SslMode.VerifyFull,
      shouldRejectUnauthorized: true,
    })
  })
})

describe('sshOf and withSsh', () => {
  it('should start a tunnel from the defaults', () => {
    expect(sshOf(CONNECTION)).toBe(DEFAULT_SSH_TUNNEL)
    expect(withSsh(CONNECTION, { host: 'bastion' }).ssh).toStrictEqual({
      ...DEFAULT_SSH_TUNNEL,
      host: 'bastion',
    })
  })

  it('should change only the given options of a tunnel', () => {
    const connection = { ...CONNECTION, ssh: TUNNEL }

    expect(sshOf(connection)).toBe(TUNNEL)
    expect(withSsh(connection, { port: 2222 }).ssh).toStrictEqual({ ...TUNNEL, port: 2222 })
  })
})

describe('tunnelChoiceOf and withTunnel', () => {
  it('should offer no tunnel and both ways to log in to SSH', () => {
    expect(Object.values(TunnelChoice)).toStrictEqual(['none', 'password', 'private-key'])
  })

  it('should tell how the connection reaches its server', () => {
    expect(tunnelChoiceOf(CONNECTION)).toBe(TunnelChoice.None)
    expect(tunnelChoiceOf({ ...CONNECTION, ssh: TUNNEL })).toBe(TunnelChoice.Password)
  })

  it('should open a tunnel from the defaults with the chosen method', () => {
    expect(withTunnel(CONNECTION, TunnelChoice.PrivateKey).ssh).toStrictEqual({
      ...DEFAULT_SSH_TUNNEL,
      authMethod: SshAuthMethod.PrivateKey,
    })
  })

  it('should keep the server and the user when the method changes', () => {
    expect(withTunnel({ ...CONNECTION, ssh: TUNNEL }, TunnelChoice.PrivateKey).ssh).toStrictEqual({
      ...TUNNEL,
      authMethod: SshAuthMethod.PrivateKey,
    })
  })

  it('should forget the tunnel', () => {
    expect(withTunnel({ ...CONNECTION, ssh: TUNNEL }, TunnelChoice.None)).toStrictEqual({
      ...CONNECTION,
      ssh: undefined,
    })
  })
})

describe('withEngine', () => {
  it('should bring the default port of the new engine when the port was the default', () => {
    expect(withEngine(CONNECTION, MYSQL, ENGINES)).toStrictEqual({
      ...CONNECTION,
      engine: 'mysql',
      port: 3306,
    })
  })

  it('should keep a port the user picked', () => {
    expect(withEngine({ ...CONNECTION, port: 6543 }, MYSQL, ENGINES)).toMatchObject({
      engine: 'mysql',
      port: 6543,
    })
    expect(withEngine({ ...CONNECTION, port: Number.NaN }, MYSQL, ENGINES).port).toBeNaN()
  })

  it('should keep the port of an engine it does not know', () => {
    expect(withEngine({ ...CONNECTION, engine: 'oracle' }, MYSQL, ENGINES)).toMatchObject({
      engine: 'mysql',
      port: 5432,
    })
  })
})

describe('path fields', () => {
  it('should know the fields that hold a file and nothing else', () => {
    expect(Object.values(PathField).every(isPathField)).toBe(true)
    expect(isPathField('host')).toBe(false)
    expect(isPathField(1)).toBe(false)
  })

  it('should read the path of each file', () => {
    const connection = { ...WITH_FILES, ssh: { ...TUNNEL, privateKeyPath: '/id' } }

    expect(Object.values(PathField).map((field) => pathOf(connection, field))).toStrictEqual([
      '/ca',
      '/cert',
      '/key',
      '/id',
    ])
    expect(pathOf(CONNECTION, PathField.SshPrivateKey)).toBe('')
  })

  it('should set and remove the path of each file', () => {
    let connection = CONNECTION
    for (const field of Object.values(PathField)) {
      connection = withPath(connection, field, `/${field}`)
    }

    expect(connection.ssl).toStrictEqual({
      ...DEFAULT_SSL,
      caPath: '/sslCaPath',
      certPath: '/sslCertPath',
      keyPath: '/sslKeyPath',
    })
    expect(connection.ssh).toStrictEqual({
      ...DEFAULT_SSH_TUNNEL,
      privateKeyPath: '/sshPrivateKeyPath',
    })
    expect(withPath(connection, PathField.SslCa, '').ssl.caPath).toBe('')
  })
})
