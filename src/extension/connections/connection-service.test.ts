import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeEngine, fakeSession } from '../../../test/fakes/engine.ts'
import { FakeMemento, FakeSecretStorage } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { type ConnectionConfig, DEFAULT_SSH_TUNNEL } from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { Engine } from '../../core/engine/engine.ts'
import { SessionManager } from '../sessions/session-manager.ts'
import { ConnectionStore } from '../storage/connection-store.ts'
import { SecretStore } from '../storage/secret-store.ts'
import { ConnectionService } from './connection-service.ts'

const ENGINE = fakeEngine({ id: 'postgres', defaultPort: 5432, urlSchemes: ['postgres'] })

interface Harness {
  readonly sut: ConnectionService
  readonly store: ConnectionStore
  readonly secrets: SecretStore
  readonly sessions: SessionManager
  readonly close: ReturnType<typeof vi.fn>
}

let nextId = 0

function harness(
  engines: readonly Engine[] = [ENGINE],
  storage = new FakeSecretStorage(),
): Harness {
  const store = new ConnectionStore(new FakeMemento(), recordingLogger())
  const secrets = new SecretStore(storage)
  const close = vi.fn(async () => Promise.resolve())
  const sessions = new SessionManager({
    open: async () => Promise.resolve({ engine: ENGINE, engineSession: fakeSession(), close }),
    readSecrets: async (connection) => secrets.read(connection),
    log: recordingLogger(),
    onConnectionLost: vi.fn(),
  })
  const sut = new ConnectionService({
    store,
    secrets,
    sessions,
    engines: new EngineRegistry(engines),
    createId: () => {
      nextId += 1
      return `id-${String(nextId)}`
    },
  })
  return { sut, store, secrets, sessions, close }
}

function shop(sut: ConnectionService): ConnectionConfig {
  return { ...sut.draft(), name: 'Shop', user: 'app' }
}

beforeEach(() => {
  nextId = 0
})

describe('ConnectionService', () => {
  it('should draft a read-only connection with a new id and the default port of the engine', () => {
    const { sut } = harness()

    expect(sut.draft()).toMatchObject({
      id: 'id-1',
      engine: 'postgres',
      port: 5432,
      isReadOnly: true,
    })
    expect(sut.engines.engines).toStrictEqual([ENGINE])
  })

  it('should draft new connections on the first registered engine', () => {
    const mysql = fakeEngine({ id: 'mysql', defaultPort: 3306, urlSchemes: ['mysql'] })

    expect(harness([mysql, ENGINE]).sut.draft()).toMatchObject({ engine: 'mysql', port: 3306 })
    expect(() => harness([]).sut.draft()).toThrow('sqldoro has no database engine registered')
  })

  it('should name the connections other than one', async () => {
    const { sut } = harness()
    await sut.save(shop(sut), new Map())
    const other = { ...shop(sut), name: ' Billing ' }
    await sut.save(other, new Map())

    expect(sut.takenNameKeys(other.id)).toStrictEqual(new Set(['shop']))
    expect(sut.takenNameKeys('')).toStrictEqual(new Set(['shop', 'billing']))
  })

  it('should save a connection with its secrets', async () => {
    const { sut, secrets } = harness()
    const connection = shop(sut)

    await sut.save(connection, new Map([[SecretKind.Password, 's3cret']]))

    expect(sut.list()).toStrictEqual([connection])
    expect(sut.find(connection.id)).toStrictEqual(connection)
    await expect(secrets.read(connection)).resolves.toStrictEqual(
      new Map([[SecretKind.Password, 's3cret']]),
    )
  })

  it('should save nothing when the keyring cannot store the secrets', async () => {
    const storage = new FakeSecretStorage()
    vi.spyOn(storage, 'store').mockRejectedValueOnce(new Error('keyring locked'))
    const { sut } = harness([ENGINE], storage)
    const connection = shop(sut)

    await expect(sut.save(connection, new Map([[SecretKind.Password, 's3cret']]))).rejects.toThrow(
      'keyring locked',
    )

    expect(sut.list()).toStrictEqual([])
  })

  it('should refuse to save an invalid connection', async () => {
    const { sut } = harness()

    await expect(sut.save({ ...shop(sut), host: '' }, new Map())).rejects.toThrow(
      'Enter the host name or IP address of the server',
    )
    expect(sut.list()).toStrictEqual([])
  })

  it('should refuse a name another connection uses, but not the connection itself', async () => {
    const { sut } = harness()
    const connection = shop(sut)
    await sut.save(connection, new Map())

    expect(sut.validate({ ...connection, name: 'shop' })).toStrictEqual([])
    expect(sut.validate({ ...shop(sut), name: ' SHOP ' })).toStrictEqual([
      { field: 'name', message: 'Another connection is already named "SHOP"' },
    ])
  })

  it('should close the open session when the changes affect it', async () => {
    const { sut, sessions, close } = harness()
    const connection = shop(sut)
    await sut.save(connection, new Map())
    await sessions.connect(connection)

    await sut.save({ ...connection, host: 'db.example.com' }, new Map())

    expect(close).toHaveBeenCalledOnce()
  })

  it('should close the open session when a secret changes', async () => {
    const { sut, sessions, close } = harness()
    const connection = shop(sut)
    await sut.save(connection, new Map())
    await sessions.connect(connection)

    await sut.save(connection, new Map([[SecretKind.Password, 'new']]))

    expect(close).toHaveBeenCalledOnce()
  })

  it('should keep the open session when only the name changes', async () => {
    const { sut, sessions, close } = harness()
    const connection = shop(sut)
    await sut.save(connection, new Map())
    await sessions.connect(connection)

    await sut.save({ ...connection, name: 'Shop (prod)' }, new Map())

    expect(close).not.toHaveBeenCalled()
  })

  it('should delete a connection, its secrets and its session', async () => {
    const { sut, secrets, sessions, close } = harness()
    const connection = shop(sut)
    await sut.save(connection, new Map([[SecretKind.Password, 's3cret']]))
    await sessions.connect(connection)

    await sut.delete(connection.id)

    expect(sut.list()).toStrictEqual([])
    expect(close).toHaveBeenCalledOnce()
    await expect(secrets.read(connection)).resolves.toStrictEqual(new Map())
  })

  it('should duplicate a connection with its secrets under a new name', async () => {
    const { sut, secrets } = harness()
    const connection = {
      ...shop(sut),
      ssh: { ...DEFAULT_SSH_TUNNEL, host: 'bastion', user: 'ops' },
    }
    await sut.save(
      connection,
      new Map([
        [SecretKind.Password, 'db'],
        [SecretKind.SshPassword, 'ssh'],
      ]),
    )

    const copy = await sut.duplicate(connection)

    expect(copy).toStrictEqual({ ...connection, id: 'id-2', name: 'Shop (copy)' })
    expect(sut.list()).toHaveLength(2)
    await expect(secrets.read(copy)).resolves.toStrictEqual(
      new Map([
        [SecretKind.Password, 'db'],
        [SecretKind.SshPassword, 'ssh'],
      ]),
    )
  })

  it('should not add a copy whose secrets cannot be copied', async () => {
    const storage = new FakeSecretStorage()
    const { sut } = harness([ENGINE], storage)
    const connection = shop(sut)
    await sut.save(connection, new Map([[SecretKind.Password, 'db']]))
    vi.spyOn(storage, 'store').mockRejectedValueOnce(new Error('keyring locked'))

    await expect(sut.duplicate(connection)).rejects.toThrow('keyring locked')

    expect(sut.list()).toStrictEqual([connection])
  })

  it('should import a URL as a new connection with a name nobody uses', async () => {
    const { sut } = harness()
    await sut.save({ ...shop(sut), name: 'db/shop' }, new Map())

    const result = sut.importUrl('postgres://app:pa55@db/shop')

    expect(result).toMatchObject({
      isValid: true,
      imported: { connection: { id: 'id-2', name: 'db/shop (2)', host: 'db' }, password: 'pa55' },
    })
  })
})
