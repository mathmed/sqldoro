// The cancel request of one statement, shared by the drivers: sent once however many times cancel()
// is called, ignored once the statement is over, and waited for before the statement settles, so
// that a late request can never stop the next statement on the connection.
export class Cancellation {
  #request: Promise<void> | undefined
  #isOver = false

  get isRequested(): boolean {
    return this.#request !== undefined
  }

  // Every call waits for the same request; it is only sent while the statement runs.
  async cancel(send: () => Promise<void>): Promise<void> {
    if (this.#isOver) {
      return
    }
    this.#request ??= send()
    await this.#request
  }

  // The statement is over: a request in flight ends first, whatever its outcome (cancel() reports
  // it to its caller).
  async finish(): Promise<void> {
    this.#isOver = true
    await this.#request?.catch(() => undefined)
  }
}
