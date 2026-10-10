import { afterEach, describe, expect, it, vi } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { FakeSecretStorage } from '../../../test/fakes/extension-context.ts'
import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  newConnection,
  SshAuthMethod,
} from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { SECRET_TIMEOUT_MS, SecretStore } from './secret-store.ts'

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

  describe('a keyring that does not answer', () => {
    const KEYRING_TIMEOUT =
      'The system keyring did not answer within 10 seconds, so sqldoro cannot read or save passwords. Make sure a keyring is running (gnome-keyring or KWallet on Linux), or start VS Code with --password-store=basic.'

    afterEach(() => {
      vi.useRealTimers()
    })

    function hangingStorage(): FakeSecretStorage {
      const storage = new FakeSecretStorage()
      const hang = async (): Promise<never> => new Promise<never>(() => undefined)
      vi.spyOn(storage, 'get').mockImplementation(hang)
      vi.spyOn(storage, 'store').mockImplementation(hang)
      vi.spyOn(storage, 'delete').mockImplementation(hang)
      return storage
    }

    it.each([
      ['read', false, async (sut: SecretStore) => sut.read(PLAIN)],
      [
        'save',
        false,
        async (sut: SecretStore) => sut.apply(PLAIN, new Map([[SecretKind.Password, 'db']])),
      ],
      ['copy', true, async (sut: SecretStore) => sut.copy(PLAIN, TUNNELED)],
      ['delete', false, async (sut: SecretStore) => sut.deleteAll('a')],
      [
        'remove',
        false,
        async (sut: SecretStore) => sut.apply(PLAIN, new Map([[SecretKind.Password, '']])),
      ],
    ])('should give up and say why when it does not %s in time', async (...[, canRead, act]) => {
      vi.useFakeTimers()
      const storage = hangingStorage()
      if (canRead) {
        vi.spyOn(storage, 'get').mockResolvedValue('db')
      }

      const outcome = act(new SecretStore(storage))
      const expectation = expect(outcome).rejects.toThrow(KEYRING_TIMEOUT)
      await vi.advanceTimersByTimeAsync(SECRET_TIMEOUT_MS)

      await expectation
    })

    it('should give up on a read after 10 seconds, not before', async () => {
      vi.useFakeTimers()
      const outcome = new SecretStore(hangingStorage()).read(PLAIN)
      const settled = vi.fn()
      void outcome.then(settled, settled)

      await vi.advanceTimersByTimeAsync(SECRET_TIMEOUT_MS - 1)
      expect(settled).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)

      await expect(outcome).rejects.toThrow(KEYRING_TIMEOUT)
    })
  })
})
