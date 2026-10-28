// What the tests of a cancel share: the clock of the cancel, moved on by hand, why a cancel closed
// a connection, and the failure a result settles with.
import { vi } from 'vitest'

import type { QueryExecution } from '../../src/core/engine/query.ts'

export const NOT_STOPPED =
  'The server did not stop the statement within 3 s: sqldoro closed the connection.'
export const REQUEST_LATE =
  'The request to stop the statement did not end within 3 s: sqldoro closed the connection, so that the request cannot stop a later statement.'

// Why a cancel closed a connection when the server could not be asked to stop the statement.
export function notAsked(failure: string): string {
  return `sqldoro could not ask the server to stop the statement (${failure}): it closed the connection.`
}

// A page, an answer or a connect that never comes.
export const NEVER: Promise<never> = Promise.withResolvers<never>().promise

// Only the timers of the cancel are faked: the fakes of the database clients answer on
// setImmediate.
export function fakeTheClock(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

export async function failureOf(execution: QueryExecution): Promise<unknown> {
  return execution.result.then(
    () => undefined,
    (error: unknown) => error,
  )
}
