import { FormMode } from '../../core/connection-form/protocol.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ValidationIssue } from '../../core/connection/validation.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SecretChanges } from '../storage/secret-store.ts'
import type { FormRequest, FormServices } from './form-request.ts'

// Why a form could not save: a message for people, and the fields at fault.
export interface SaveRefusal {
  readonly message: string
  readonly issues: readonly ValidationIssue[]
}

export interface SaveRequest {
  readonly request: FormRequest
  readonly connection: ConnectionConfig
  readonly secretChanges: SecretChanges
}

const FIX_FIELDS = 'Fix the fields marked in the form, then save again.'

// Saves the connection of a form after checking it again, here, where the other connections are
// known for sure; resolves with why it did not, or undefined once it did.
export async function saveConnection(
  { service, log }: Pick<FormServices, 'log' | 'service'>,
  { request, connection, secretChanges }: SaveRequest,
): Promise<SaveRefusal | undefined> {
  const refusal = refusalOf(service, request, connection)
  if (refusal !== undefined) {
    return refusal
  }
  try {
    await service.save(connection, secretChanges)
    return undefined
  } catch (error) {
    const message = describeError(error)
    log.error(`Saving the connection "${connection.name}" failed: ${message}`)
    return { message: `sqldoro could not save the connection: ${message}`, issues: [] }
  }
}

// A connection deleted while its form was open is not created again behind the user's back.
function refusalOf(
  service: FormServices['service'],
  request: FormRequest,
  connection: ConnectionConfig,
): SaveRefusal | undefined {
  if (request.mode === FormMode.Edit && service.find(connection.id) === undefined) {
    return {
      message: `The connection "${request.connection.name}" was deleted while this form was open: sqldoro did not create it again. Close the form, or add it as a new connection.`,
      issues: [],
    }
  }
  const issues = service.validate(connection)
  return issues.length === 0 ? undefined : { message: FIX_FIELDS, issues }
}
