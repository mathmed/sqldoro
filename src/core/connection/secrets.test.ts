import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { DEFAULT_SSH_TUNNEL, newConnection, SshAuthMethod } from './connection.ts'
import { applySecretChanges, isSecretKind, SecretKind, secretKindsOf, secretOf } from './secrets.ts'

const CONNECTION = newConnection('id', fakeEngine())

describe('secretKindsOf', () => {
  it('should only use the database password without a tunnel', () => {
    expect(secretKindsOf(CONNECTION)).toStrictEqual([SecretKind.Password])
  })

  it('should add the SSH password for a tunnel with password authentication', () => {
    const sut = secretKindsOf({ ...CONNECTION, ssh: DEFAULT_SSH_TUNNEL })

    expect(sut).toStrictEqual([SecretKind.Password, SecretKind.SshPassword])
  })

  it('should add the key passphrase for a tunnel with a private key', () => {
    const ssh = { ...DEFAULT_SSH_TUNNEL, authMethod: SshAuthMethod.PrivateKey }

    expect(secretKindsOf({ ...CONNECTION, ssh })).toStrictEqual([
      SecretKind.Password,
      SecretKind.SshPassphrase,
    ])
  })
})

describe('isSecretKind', () => {
  it('should know every kind of secret and nothing else', () => {
    expect(Object.values(SecretKind).every(isSecretKind)).toBe(true)
    expect(isSecretKind('token')).toBe(false)
    expect(isSecretKind(1)).toBe(false)
  })
})

describe('secretOf', () => {
  it('should return the stored secret', () => {
    expect(secretOf(new Map([[SecretKind.Password, 's3cret']]), SecretKind.Password)).toBe('s3cret')
  })

  it('should return an empty secret when none is stored', () => {
    expect(secretOf(new Map(), SecretKind.SshPassphrase)).toBe('')
  })
})

describe('applySecretChanges', () => {
  it('should add, replace and remove secrets', () => {
    const stored = new Map([
      [SecretKind.Password, 'old'],
      [SecretKind.SshPassword, 'ssh'],
    ])
    const changes = new Map([
      [SecretKind.Password, 'new'],
      [SecretKind.SshPassword, ''],
      [SecretKind.SshPassphrase, 'phrase'],
    ])

    expect(applySecretChanges(stored, changes)).toStrictEqual(
      new Map([
        [SecretKind.Password, 'new'],
        [SecretKind.SshPassphrase, 'phrase'],
      ]),
    )
    expect(stored.get(SecretKind.Password)).toBe('old')
  })
})
