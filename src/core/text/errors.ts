// The message to show for anything a library throws: Node.js reports some network failures as an
// AggregateError with an empty message, and others only through their code.
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return messageOf(error)
  }
  return typeof error === 'string' && error !== '' ? error : 'Unknown error'
}

// Callbacks can throw anything: what reaches the user is always an Error with a readable message.
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(describeError(error))
}

function messageOf(error: Error): string {
  if (error.message !== '') {
    return error.message
  }
  if (error instanceof AggregateError && error.errors.length > 0) {
    return [...new Set(error.errors.map(describeError))].join('; ')
  }
  return codeOf(error) ?? error.name
}

function codeOf(error: Error): string | undefined {
  return 'code' in error && typeof error.code === 'string' ? error.code : undefined
}
