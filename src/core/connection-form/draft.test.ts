import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { DEFAULT_SSH_TUNNEL, newConnection, SshAuthMethod } from '../connection/connection.ts'
import { SecretKind } from '../connection/secrets.ts'
import {
  newDraft,
  secretChangesOf,
  SecretState,
  secretState,
  typedSecret,
  withConnection,
  withSecretKept,
  withSecretRemoved,
  withTypedSecret,
} from './draft.ts'

const CONNECTION = newConnection('id', fakeEngine())
const HELD = newDraft(CONNECTION, new Set([SecretKind.Password]))

describe('newDraft', () => {
  it('should start without changes', () => {
    expect(HELD).toStrictEqual({
      connection: CONNECTION,
      secretChanges: new Map(),
      heldSecrets: new Set([SecretKind.Password]),
    })
  })
})

describe('secretState', () => {
  it('should tell a held secret from one that is not set', () => {
    expect(secretState(HELD, SecretKind.Password)).toBe(SecretState.Held)
    expect(secretState(HELD, SecretKind.SshPassword)).toBe(SecretState.NotSet)
  })

  it('should tell a typed secret from a removed one', () => {
    expect(
      secretState(withTypedSecret(HELD, SecretKind.Password, 'new'), SecretKind.Password),
    ).toBe(SecretState.Changed)
    expect(secretState(withSecretRemoved(HELD, SecretKind.Password), SecretKind.Password)).toBe(
      SecretState.Removed,
    )
  })
})

describe('typedSecret', () => {
  it('should show only what was typed', () => {
    expect(typedSecret(HELD, SecretKind.Password)).toBe('')
    expect(
      typedSecret(withTypedSecret(HELD, SecretKind.Password, 'new'), SecretKind.Password),
    ).toBe('new')
  })
})

describe('withTypedSecret', () => {
  it('should replace the secret with what was typed, and keep it once the input is cleared', () => {
    const typed = withTypedSecret(HELD, SecretKind.Password, 'new')

    expect(typed.secretChanges).toStrictEqual(new Map([[SecretKind.Password, 'new']]))
    expect(withTypedSecret(typed, SecretKind.Password, '').secretChanges).toStrictEqual(new Map())
    expect(HELD.secretChanges).toStrictEqual(new Map())
  })
})

describe('withSecretRemoved and withSecretKept', () => {
  it('should remove a secret, and keep it again', () => {
    const removed = withSecretRemoved(HELD, SecretKind.Password)

    expect(removed.secretChanges).toStrictEqual(new Map([[SecretKind.Password, '']]))
    expect(withSecretKept(removed, SecretKind.Password).secretChanges).toStrictEqual(new Map())
    expect(removed.heldSecrets).toBe(HELD.heldSecrets)
  })
})

describe('withConnection', () => {
  it('should change the connection and keep the secret changes', () => {
    const typed = withTypedSecret(HELD, SecretKind.Password, 'new')
    const connection = { ...CONNECTION, host: 'db' }

    expect(withConnection(typed, connection)).toStrictEqual({ ...typed, connection })
  })
})

describe('secretChangesOf', () => {
  it('should send only the changes of the secrets the connection uses', () => {
    let draft = withTypedSecret(HELD, SecretKind.SshPassword, 'ssh')
    draft = withSecretRemoved(draft, SecretKind.Password)
    draft = withTypedSecret(draft, SecretKind.SshPassphrase, 'phrase')

    expect(secretChangesOf(draft)).toStrictEqual([{ kind: SecretKind.Password, value: '' }])
    expect(
      secretChangesOf(withConnection(draft, { ...CONNECTION, ssh: DEFAULT_SSH_TUNNEL })),
    ).toStrictEqual([
      { kind: SecretKind.Password, value: '' },
      { kind: SecretKind.SshPassword, value: 'ssh' },
    ])
    const ssh = { ...DEFAULT_SSH_TUNNEL, authMethod: SshAuthMethod.PrivateKey }
    expect(secretChangesOf(withConnection(draft, { ...CONNECTION, ssh }))).toStrictEqual([
      { kind: SecretKind.Password, value: '' },
      { kind: SecretKind.SshPassphrase, value: 'phrase' },
    ])
  })
})
