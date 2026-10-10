import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { SecretKind } from '../../core/connection/secrets.ts'
import type { SecretChanges } from '../storage/secret-store.ts'

// The connection being edited, and the secret changes that go with it once saved.
export interface FormDraft {
  readonly connection: ConnectionConfig
  readonly secretChanges: SecretChanges
  // The secrets already stored for this connection when the form opened.
  readonly storedSecrets: ReadonlySet<SecretKind>
}

export const SecretState = {
  NotSet: 'not set',
  Stored: 'stored',
  Changed: 'changed',
  Removed: 'removed',
} as const

export type SecretState = (typeof SecretState)[keyof typeof SecretState]

export function secretState(draft: FormDraft, kind: SecretKind): SecretState {
  const change = draft.secretChanges.get(kind)
  if (change === undefined) {
    return draft.storedSecrets.has(kind) ? SecretState.Stored : SecretState.NotSet
  }
  return change === '' ? SecretState.Removed : SecretState.Changed
}

export function withConnection(draft: FormDraft, connection: ConnectionConfig): FormDraft {
  return { ...draft, connection }
}

export function withSecret(draft: FormDraft, kind: SecretKind, value: string): FormDraft {
  return { ...draft, secretChanges: new Map(draft.secretChanges).set(kind, value) }
}
