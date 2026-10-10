import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { FakeSecretStorage } from '../../../test/fakes/extension-context.ts'
import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  newConnection,
  SshAuthMethod,
} from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { SecretStore } from './secret-store.ts'

const PLAIN: ConnectionConfig = newConnection('a', fakeEngine())
const TUNNELED: ConnectionConfig = { ...PLAIN, ssh: DEFAULT_SSH_TUNNEL }

describe('SecretStore', () => {
  it('should keep each secret under its connection and kind', async () => {
    const storage = new FakeSecretStorage()
    const sut = new SecretStore(storage)

    await sut.apply(
      TUNNELED,
      new Map([
        [SecretKind.Password, 'db'],
        [SecretKind.SshPassword, 'ssh'],
      ]),
    )

    expect(storage.values).toStrictEqual(
      new Map([
        ['sqldoro.connection.a.password', 'db'],
        ['sqldoro.connection.a.ssh-password', 'ssh'],
      ]),
    )
    await expect(sut.read(TUNNELED)).resolves.toStrictEqual(
      new Map([
        [SecretKind.Password, 'db'],
        [SecretKind.SshPassword, 'ssh'],
      ]),
    )
  })

  it('should remove a secret changed to an empty value', async () => {
    const sut = new SecretStore(new FakeSecretStorage())
    await sut.apply(PLAIN, new Map([[SecretKind.Password, 'db']]))

    await sut.apply(PLAIN, new Map([[SecretKind.Password, '']]))

    await expect(sut.read(PLAIN)).resolves.toStrictEqual(new Map())
  })

  it('should only read the secrets the connection uses and say which ones are stored', async () => {
    const sut = new SecretStore(new FakeSecretStorage())
    await sut.apply(TUNNELED, new Map([[SecretKind.SshPassword, 'ssh']]))

    await expect(sut.storedKinds(TUNNELED)).resolves.toStrictEqual(
      new Set([SecretKind.SshPassword]),
    )
    await expect(sut.read(PLAIN)).resolves.toStrictEqual(new Map())
  })

  it('should delete the secrets a changed connection no longer uses', async () => {
    const storage = new FakeSecretStorage()
    const sut = new SecretStore(storage)
    await sut.apply(
      TUNNELED,
      new Map([
        [SecretKind.Password, 'db'],
        [SecretKind.SshPassword, 'ssh'],
      ]),
    )
    const withKey = {
      ...TUNNELED,
      ssh: { ...DEFAULT_SSH_TUNNEL, authMethod: SshAuthMethod.PrivateKey },
    }

    await sut.apply(withKey, new Map([[SecretKind.SshPassphrase, 'phrase']]))

    expect([...storage.values.keys()]).toStrictEqual([
      'sqldoro.connection.a.password',
      'sqldoro.connection.a.ssh-passphrase',
    ])
  })

  it('should copy the secrets of a connection to another one', async () => {
    const sut = new SecretStore(new FakeSecretStorage())
    await sut.apply(PLAIN, new Map([[SecretKind.Password, 'db']]))
    const copy = { ...PLAIN, id: 'b' }

    await sut.copy(PLAIN, copy)

    await expect(sut.read(copy)).resolves.toStrictEqual(new Map([[SecretKind.Password, 'db']]))
  })

  it('should delete every secret of a connection', async () => {
    const storage = new FakeSecretStorage()
    const sut = new SecretStore(storage)
    await sut.apply(
      TUNNELED,
      new Map([
        [SecretKind.Password, 'db'],
        [SecretKind.SshPassword, 'ssh'],
      ]),
    )
    await sut.apply({ ...PLAIN, id: 'b' }, new Map([[SecretKind.Password, 'other']]))

    await sut.deleteAll('a')

    expect([...storage.values.keys()]).toStrictEqual(['sqldoro.connection.b.password'])
  })
})
