import { describeError, toError } from '../text/errors.ts'
import { QueryCancelledError } from './query.ts'

// How long a cancel gives the server to stop the statement, the request that asks it included:
// past it the driver closes the connection of the statement, so that the wait always ends.
export const CANCEL_TIMEOUT_MS = 3000

const MS_PER_SECOND = 1000
const WITHIN = `within ${String(CANCEL_TIMEOUT_MS / MS_PER_SECOND)} s`
const NOT_STOPPED = `The server did not stop the statement ${WITHIN}: sqldoro closed the connection.`
const REQUEST_LATE = `The request to stop the statement did not end ${WITHIN}: sqldoro closed the connection, so that the request cannot stop a later statement.`
const GIVEN_UP = `The request to stop the statement did not end ${WITHIN}.`

// Resolves once this many milliseconds have gone by: the timer of the platform the driver runs on.
export type Wait = (milliseconds: number) => Promise<void>

// How a driver stops the statement of a connection.
export interface Stopper {
  // Asks the server to stop the statement, from another connection. It ends by `deadline`: once it
  // resolves, the driver gives the request up and closes that connection (untilDeadline).
  readonly kill: (deadline: Promise<void>) => Promise<void>
  // Closes the connection of the statement at once, whatever the server and the network do: the
  // statement settles as cancelled, and the session hears why it ended.
  readonly drop: (reason: Error) => void
}

// How the request to stop the statement went by the deadline: over, with its failure if it failed,
// or still on its way (it ends right after: the driver gives it up).
type KillOutcome =
  | { readonly isLate: false; readonly failure: Error | undefined }
  | { readonly isLate: true; readonly ended: Promise<unknown> }

// The cancel of one statement, shared by the drivers. It is sent once however many times cancel()
// is called, ignored once the statement is over, and always ends the wait: the server stops the
// statement within CANCEL_TIMEOUT_MS, or the driver closes its connection. The statement settles
// only once the cancel is over, so that a late request can never stop the next statement on the
// connection.
export class Cancellation {
  readonly #wait: Wait
  readonly #over = Promise.withResolvers<undefined>()
  #request: Promise<void> | undefined
  #isOver = false
  #hasClosedConnection = false

  constructor(wait: Wait) {
    this.#wait = wait
  }

  get isRequested(): boolean {
    return this.#request !== undefined
  }

  // Every call waits for the same cancel; it only starts while the statement runs.
  async cancel(stopper: Stopper): Promise<void> {
    if (this.#isOver) {
      return
    }
    this.#request ??= this.#stop(stopper)
    await this.#request
  }

  // The statement is over: a cancel in flight ends first, whatever its outcome (cancel() reports
  // it to its callers).
  async finish(): Promise<void> {
    this.#isOver = true
    this.#over.resolve(undefined)
    await this.#request?.catch(() => undefined)
  }

  // What a statement that was cancelled rejects with: it says whether its connection was closed.
  cancelledError(): QueryCancelledError {
    return new QueryCancelledError({ hasClosedConnection: this.#hasClosedConnection })
  }

  // A request still on its way at the deadline may reach the server later, and stop the statement
  // that runs then: the connection goes even when the statement ended.
  async #stop(stopper: Stopper): Promise<void> {
    const deadline = this.#wait(CANCEL_TIMEOUT_MS)
    const outcome = await killBy(stopper.kill(deadline), deadline)
    if (outcome.isLate) {
      this.#close(stopper, new Error(REQUEST_LATE))
      await outcome.ended
      return
    }
    if (outcome.failure === undefined) {
      await Promise.race([this.#over.promise, deadline])
    }
    if (!this.#isOver) {
      this.#close(stopper, reasonOf(outcome.failure))
    }
  }

  #close(stopper: Stopper, reason: Error): void {
    this.#hasClosedConnection = true
    stopper.drop(reason)
  }
}

async function killBy(killing: Promise<void>, deadline: Promise<void>): Promise<KillOutcome> {
  const ended = killing.then(() => undefined, toError)
  return Promise.race([
    ended.then((failure) => ({ isLate: false, failure }) as const),
    deadline.then(() => ({ isLate: true, ended }) as const),
  ])
}

// Why the connection of a statement that did not stop goes: the server was asked, or could not be.
function reasonOf(failure: Error | undefined): Error {
  if (failure === undefined) {
    return new Error(NOT_STOPPED)
  }
  return new Error(
    `sqldoro could not ask the server to stop the statement (${describeError(failure)}): it closed the connection.`,
    { cause: failure },
  )
}

// What `work` gives; once `deadline` passes first, a failure, after `abandon` ran: the request of a
// cancel never keeps its connection past the deadline.
export async function untilDeadline<T>(
  work: Promise<T>,
  deadline: Promise<void>,
  abandon: () => void,
): Promise<T> {
  let isOver = false
  const over = work.finally(() => {
    isOver = true
  })
  const late = deadline.then((): never => {
    if (!isOver) {
      abandon()
    }
    throw new Error(GIVEN_UP)
  })
  return Promise.race([over, late])
}
