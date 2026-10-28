import type { QueryExecution } from '../../core/engine/query.ts'

// The run of an editor: the statement it is on, and whether the user cancelled it. Once cancelled,
// it starts no other statement and waits for nothing else.
export class ActiveRun {
  readonly #cancelled = Promise.withResolvers<undefined>()
  #execution: QueryExecution | undefined
  #isCancelled = false

  get isCancelled(): boolean {
    return this.#isCancelled
  }

  // Resolves once the run is cancelled.
  get whenCancelled(): Promise<undefined> {
    return this.#cancelled.promise
  }

  track(execution: QueryExecution): void {
    this.#execution = execution
  }

  // The statement in flight stops: its driver ends the wait within its timeout.
  async cancel(): Promise<void> {
    this.#isCancelled = true
    this.#cancelled.resolve(undefined)
    await this.#execution?.cancel()
  }
}
