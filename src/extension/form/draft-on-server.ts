import { blockingIssues } from '../../core/connection-form/form-issues.ts'
import { FormAction } from '../../core/connection-form/form-state.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { applySecretChanges, type ConnectionSecrets } from '../../core/connection/secrets.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SecretChanges } from '../storage/secret-store.ts'
import type { FormServices, ServerCheck } from './form-request.ts'

// The connection of a form as it would be saved: the secrets typed for it go over the held ones.
export interface ServerDraft {
  readonly connection: ConnectionConfig
  readonly secretChanges: SecretChanges
}

// What a check needs from the extension: the validation of a connection, and the secrets it holds.
export interface CheckServices extends Pick<FormServices, 'service'> {
  readonly readStored: (connection: ConnectionConfig) => Promise<ConnectionSecrets>
}

export type ServerOutcome<T> =
  | { readonly isSuccess: true; readonly value: T }
  | { readonly isSuccess: false; readonly message: string }

// Runs a check against the server of a draft, checked again here first: a session needs what a test
// needs, everything but a name. The server's error, or what is wrong, is the message of the outcome.
export async function checkOnServer<T>(
  { service, readStored }: CheckServices,
  draft: ServerDraft,
  check: ServerCheck<T>,
): Promise<ServerOutcome<T>> {
  const [issue] = blockingIssues(service.validate(draft.connection), FormAction.Test)
  if (issue !== undefined) {
    return { isSuccess: false, message: `Fix the connection first: ${issue.message}` }
  }
  try {
    const stored = await readStored(draft.connection)
    const value = await check(draft.connection, applySecretChanges(stored, draft.secretChanges))
    return { isSuccess: true, value }
  } catch (error) {
    return { isSuccess: false, message: describeError(error) }
  }
}
