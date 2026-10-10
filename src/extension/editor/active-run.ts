import type { QueryExecution } from '../../core/engine/query.ts'

// The run of an editor: the statement it is on, and whether the user cancelled it.
export class ActiveRun {
  #execution: QueryExecution | undefined
  #isCancelled = false

  get isCancelled(): boolean {
    return this.#isCancelled
  }

  track(execution: QueryExecution): void {
    this.#execution = execution
  }

  async cancel(): Promise<void> {
    this.#isCancelled = true
    await this.#execution?.cancel()
  }
}
