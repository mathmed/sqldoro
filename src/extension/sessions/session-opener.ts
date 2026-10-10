import {
  openSession,
  type Session,
  type SessionDependencies,
  type SessionRequest,
} from '../../core/session/open-session.ts'
import { describeError } from '../../core/text/errors.ts'
import { redactSecrets } from '../../core/text/redact.ts'

export type SessionOpener = (request: SessionRequest) => Promise<Session>

// What a failed connection reports goes to the screen and the log: the secrets it was opened with
// never appear in it.
export function createSessionOpener(dependencies: SessionDependencies): SessionOpener {
  return async (request) => {
    try {
      return await openSession(dependencies, request)
    } catch (error) {
      // eslint-disable-next-line preserve-caught-error -- the original error may carry the secrets this message masks
      throw new Error(redactSecrets(describeError(error), request.secrets.values()))
    }
  }
}
