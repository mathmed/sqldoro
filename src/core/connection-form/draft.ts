import type { ConnectionConfig } from '../connection/connection.ts'
import { type SecretKind, secretKindsOf } from '../connection/secrets.ts'

// The connection being edited, and the secret changes that go with it once saved.
export interface FormDraft {
  readonly connection: ConnectionConfig
  // A value replaces the secret, an empty one removes it; a kind that is not here keeps it.
  readonly secretChanges: ReadonlyMap<SecretKind, string>
  // The secrets the extension holds for the connection (stored, or from an imported URL): only
  // their kinds, never their values.
  readonly heldSecrets: ReadonlySet<SecretKind>
  // Those of the held secrets that come from an imported URL rather than the secret storage.
  readonly urlSecrets: ReadonlySet<SecretKind>
}

// A secret change as the form sends it to the extension.
export interface SecretChange {
  readonly kind: SecretKind
  readonly value: string
}

export const SecretState = {
  NotSet: 'notSet',
  Held: 'held',
  Changed: 'changed',
  Removed: 'removed',
} as const

export type SecretState = (typeof SecretState)[keyof typeof SecretState]

export function newDraft(
  connection: ConnectionConfig,
  heldSecrets: ReadonlySet<SecretKind>,
): FormDraft {
  return { connection, secretChanges: new Map(), heldSecrets, urlSecrets: new Set() }
}

export function secretState(draft: FormDraft, kind: SecretKind): SecretState {
  const change = draft.secretChanges.get(kind)
  if (change === undefined) {
    return draft.heldSecrets.has(kind) ? SecretState.Held : SecretState.NotSet
  }
  return change === '' ? SecretState.Removed : SecretState.Changed
}

// What the input of a secret shows: what was typed, never what the extension holds.
export function typedSecret(draft: FormDraft, kind: SecretKind): string {
  return draft.secretChanges.get(kind) ?? ''
}

export function withConnection(draft: FormDraft, connection: ConnectionConfig): FormDraft {
  return { ...draft, connection }
}

// What is typed replaces the secret; clearing the input keeps the one the extension holds.
export function withTypedSecret(draft: FormDraft, kind: SecretKind, value: string): FormDraft {
  return value === '' ? withSecretKept(draft, kind) : withChange(draft, kind, value)
}

export function withSecretRemoved(draft: FormDraft, kind: SecretKind): FormDraft {
  return withChange(draft, kind, '')
}

// Forgets the change: the secret the extension holds, if any, stays.
export function withSecretKept(draft: FormDraft, kind: SecretKind): FormDraft {
  const secretChanges = new Map(draft.secretChanges)
  secretChanges.delete(kind)
  return { ...draft, secretChanges }
}

// The changes to send: only those of the secrets the connection uses; the others are deleted once
// it is saved.
export function secretChangesOf(draft: FormDraft): readonly SecretChange[] {
  return secretKindsOf(draft.connection).flatMap((kind) => {
    const value = draft.secretChanges.get(kind)
    return value === undefined ? [] : [{ kind, value }]
  })
}

// The secrets of an imported URL replace what was typed for them; the stored ones stay held.
export function withUrlSecrets(
  draft: FormDraft,
  storedSecrets: ReadonlySet<SecretKind>,
  urlSecrets: readonly SecretKind[],
): FormDraft {
  const secretChanges = new Map(draft.secretChanges)
  for (const kind of urlSecrets) {
    secretChanges.delete(kind)
  }
  return {
    ...draft,
    secretChanges,
    heldSecrets: new Set([...storedSecrets, ...urlSecrets]),
    urlSecrets: new Set(urlSecrets),
  }
}

function withChange(draft: FormDraft, kind: SecretKind, value: string): FormDraft {
  return { ...draft, secretChanges: new Map(draft.secretChanges).set(kind, value) }
}
