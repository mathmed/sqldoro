// The clock of the extension, given to what measures or dates things, so that tests can set it.
export interface Clock {
  // Milliseconds from an arbitrary start: for durations.
  readonly now: () => number
  // The current time in ISO 8601, in UTC: for what is stored.
  readonly timestamp: () => string
}

export const systemClock: Clock = {
  now: () => performance.now(),
  timestamp: () => new Date().toISOString(),
}
