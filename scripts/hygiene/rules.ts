import { formatBytes } from '../shared/text.ts'

const BYTES_PER_KB = 1024
// pre-commit's check-added-large-files default: a file this large is added on purpose, or not at all.
const MAX_ADDED_FILE_KB = 500
export const MAX_ADDED_FILE_BYTES = MAX_ADDED_FILE_KB * BYTES_PER_KB
// Git's own test for a binary file: a NUL byte among the first bytes.
const BINARY_PROBE_BYTES = 8000
const NUL = 0
const BLANKS: ReadonlySet<string> = new Set([' ', '\t'])
const LINE_BREAKS: ReadonlySet<string> = new Set(['\n'])
const LINE_BREAK = '\n'

export interface Problem {
  readonly path: string
  // 1-based; undefined for a problem of the whole file.
  readonly line: number | undefined
  readonly message: string
}

export function isBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, BINARY_PROBE_BYTES).includes(NUL)
}

// What trailing-whitespace and end-of-file-fixer would change in the text.
export function textProblems(path: string, text: string): Problem[] {
  const lines = text.split(LINE_BREAK)
  const trailing = lines
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => trimEnd(line, BLANKS) !== line)
    .map(({ number }) => ({ path, line: number, message: 'trailing whitespace' }))
  const ending = endingProblem(text)
  return ending === undefined ? trailing : [...trailing, { path, line: undefined, message: ending }]
}

function endingProblem(text: string): string | undefined {
  if (text === '') {
    return undefined
  }
  if (!text.endsWith(LINE_BREAK)) {
    return 'no newline at the end of the file'
  }
  const body = text.slice(0, -LINE_BREAK.length)
  const lastLine = body.slice(body.lastIndexOf(LINE_BREAK) + 1)
  return trimEnd(lastLine, BLANKS) === '' ? 'blank lines at the end of the file' : undefined
}

// The text with no trailing whitespace and exactly one newline at its end (none when it is empty).
export function fixText(text: string): string {
  const lines = text.split(LINE_BREAK).map((line) => trimEnd(line, BLANKS))
  const body = trimEnd(lines.join(LINE_BREAK), LINE_BREAKS)
  return body === '' ? '' : `${body}${LINE_BREAK}`
}

// The text without the given characters at its end (a loop: no regular expression to backtrack).
function trimEnd(text: string, characters: ReadonlySet<string>): string {
  let end = text.length
  while (end > 0 && characters.has(text.charAt(end - 1))) {
    end -= 1
  }
  return text.slice(0, end)
}

export function largeFileProblem(path: string, bytes: number): Problem | undefined {
  if (bytes <= MAX_ADDED_FILE_BYTES) {
    return undefined
  }
  const message = `${formatBytes(bytes)} added, above the ${formatBytes(MAX_ADDED_FILE_BYTES)} limit`
  return { path, line: undefined, message }
}

export function formatProblem({ path, line, message }: Problem): string {
  return line === undefined ? `${path}: ${message}` : `${path}:${String(line)}: ${message}`
}
