// Tells everyone interested that a connection ended: the listeners hear every failure, the owner
// hears about the first one only, and nobody hears about an end that close() caused.
export class ConnectionWatch {
  readonly #listeners = new Set<(error: Error) => void>()
  readonly #onUnexpectedClose: (error: Error) => void
  #hasEnded = false

  constructor(onUnexpectedClose: (error: Error) => void) {
    this.#onUnexpectedClose = onUnexpectedClose
  }

  readonly report = (error: Error): void => {
    for (const listener of [...this.#listeners]) {
      listener(error)
    }
    if (this.#hasEnded) {
      return
    }
    this.#hasEnded = true
    this.#onUnexpectedClose(error)
  }

  readonly listen = (listener: (error: Error) => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  close(): void {
    this.#hasEnded = true
  }
}
