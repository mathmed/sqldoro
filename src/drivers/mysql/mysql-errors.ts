import { ErrorLocationKind, QueryError } from '../../core/engine/query-error.ts'

// "... for the right syntax to use near 'FORM t' at line 2"
const AT_LINE = / at line (\d+)$/
const NEAR = "near '"

// A syntax error says on which line of the statement the server stopped and what it read there;
// any other error goes on as it is.
export function locatedError(error: Error): Error {
  const lineMatch = AT_LINE.exec(error.message)
  if (lineMatch === null) {
    return error
  }
  const nearStart = error.message.indexOf(NEAR)
  const near =
    nearStart === -1 ? '' : error.message.slice(nearStart + NEAR.length, lineMatch.index - 1)
  return new QueryError(
    error.message,
    { kind: ErrorLocationKind.Line, line: Number(lineMatch[1]), near },
    { cause: error },
  )
}
