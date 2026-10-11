import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import {
  changesSession,
  ConnectionColor,
  DEFAULT_SSH_TUNNEL,
  DEFAULT_SSL,
  duplicateConnection,
  EnvironmentTag,
  isConnectionColor,
  isEnvironmentTag,
  isSshAuthMethod,
  isSslMode,
  newConnection,
  SshAuthMethod,
  SslMode,
} from './connection.ts'

describe('newConnection', () => {
  it('should start read-only, untagged, on localhost with the default port of the engine', () => {
    const sut = newConnection('id-1', fakeEngine({ id: 'postgres', defaultPort: 5432 }))

    expect(sut).toStrictEqual({
      id: 'id-1',
      name: '',
      engine: 'postgres',
      host: 'localhost',
      port: 5432,
      user: '',
      database: '',
      ssl: DEFAULT_SSL,
      ssh: undefined,
      environment: EnvironmentTag.None,
      isReadOnly: true,
      color: ConnectionColor.None,
      folder: '',
    })
  })
})

describe('isConnectionColor', () => {
  it('should know every color, no color included, and nothing else', () => {
    for (const color of Object.values(ConnectionColor)) {
      expect(isConnectionColor(color)).toBe(true)
    }
    expect(isConnectionColor('pink')).toBe(false)
    expect(isConnectionColor(undefined)).toBe(false)
  })
})

describe('DEFAULT_SSL', () => {
  it('should disable SSL and reject unauthorized certificates once it is enabled', () => {
    expect(DEFAULT_SSL).toStrictEqual({
      mode: SslMode.Disable,
      caPath: '',
      certPath: '',
      keyPath: '',
      shouldRejectUnauthorized: true,
    })
  })
})

describe('DEFAULT_SSH_TUNNEL', () => {
  it('should use port 22 and a password', () => {
    expect(DEFAULT_SSH_TUNNEL).toStrictEqual({
      host: '',
      port: 22,
      user: '',
      authMethod: SshAuthMethod.Password,
      privateKeyPath: '',
    })
  })
})

describe('duplicateConnection', () => {
  const source = { ...newConnection('id-1', fakeEngine()), name: 'Shop' }

  it('should copy the connection with a new id and a copy name', () => {
    expect(duplicateConnection(source, 'id-2', new Set(['shop']))).toStrictEqual({
      ...source,
      id: 'id-2',
      name: 'Shop (copy)',
    })
  })

  it('should number the copy when the copy name is taken', () => {
    const sut = duplicateConnection(source, 'id-3', new Set(['shop', 'shop (copy)']))

    expect(sut.name).toBe('Shop (copy) (2)')
  })
})

describe('isEnvironmentTag', () => {
  it.each(['none', 'local', 'dev', 'staging', 'prod'])('should accept %s', (value) => {
    expect(isEnvironmentTag(value)).toBe(true)
  })

  it.each(['production', 'PROD', '', 1, undefined])('should reject %s', (value) => {
    expect(isEnvironmentTag(value)).toBe(false)
  })
})

describe('isSslMode', () => {
  it.each(['disable', 'require', 'verify-ca', 'verify-full'])('should accept %s', (value) => {
    expect(isSslMode(value)).toBe(true)
  })

  it.each(['prefer', 'REQUIRE', null])('should reject %s', (value) => {
    expect(isSslMode(value)).toBe(false)
  })
})

describe('isSshAuthMethod', () => {
  it.each(['password', 'private-key'])('should accept %s', (value) => {
    expect(isSshAuthMethod(value)).toBe(true)
  })

  it.each(['agent', true])('should reject %s', (value) => {
    expect(isSshAuthMethod(value)).toBe(false)
  })
})

describe('changesSession', () => {
  const connection = { ...newConnection('id', fakeEngine()), name: 'Shop', user: 'app' }

  it.each([
    { field: 'the name', changes: { name: 'Shop (prod)' } },
    { field: 'the environment', changes: { environment: EnvironmentTag.Production } },
    { field: 'the color', changes: { color: ConnectionColor.Blue } },
    { field: 'the folder', changes: { folder: 'clients' } },
  ])('should keep the session when only $field changes', ({ changes }) => {
    expect(changesSession(connection, { ...connection, ...changes })).toBe(false)
  })

  it.each([
    { field: 'engine', changes: { engine: 'other' } },
    { field: 'host', changes: { host: 'db.example.com' } },
    { field: 'port', changes: { port: 1 } },
    { field: 'user', changes: { user: 'root' } },
    { field: 'database', changes: { database: 'shop' } },
    { field: 'ssl', changes: { ssl: { ...DEFAULT_SSL, mode: SslMode.Require } } },
    { field: 'ssh', changes: { ssh: DEFAULT_SSH_TUNNEL } },
    { field: 'read-only flag', changes: { isReadOnly: false } },
  ])('should need a new session when the $field changes', ({ changes }) => {
    expect(changesSession(connection, { ...connection, ...changes })).toBe(true)
  })
})
