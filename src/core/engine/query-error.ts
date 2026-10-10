// Where in a statement the server located an error: PostgreSQL gives the character, MySQL the line
// and the text it stopped at.
export const ErrorLocationKind = {
  Offset: 'offset',
  Line: 'line',
} as const

export type ErrorLocation =
  // 0-based, in characters (code points) of the statement as it was sent.
  | { readonly kind: typeof ErrorLocationKind.Offset; readonly offset: number }
  // 1-based line of the statement, and the start of the text the server quoted (may be empty).
  | { readonly kind: typeof ErrorLocationKind.Line; readonly line: number; readonly near: string }

// A statement the server refused, with the place it pointed at. The message is the server's.
export class QueryError extends Error {
  override readonly name = 'QueryError'
  readonly location: ErrorLocation

  constructor(message: string, location: ErrorLocation, options?: ErrorOptions) {
    super(message, options)
    this.location = location
  }
}
