import { ErrorLocationKind, QueryError } from '../../core/engine/query-error.ts'

// PostgreSQL points at the character of the statement where it found the error (from 1); any other
// error goes on as it is.
export function locatedError(error: Error): Error {
  const position = positionOf(error)
  if (position === undefined) {
    return error
  }
  return new QueryError(
    error.message,
    { kind: ErrorLocationKind.Offset, offset: position - 1 },
    { cause: error },
  )
}

function positionOf(error: Error): number | undefined {
  const position =
    'position' in error && typeof error.position === 'string' ? Number(error.position) : 0
  return Number.isSafeInteger(position) && position > 0 ? position : undefined
}
