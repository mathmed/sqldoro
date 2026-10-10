// JSON.parse source text access (ES2025 engines: Node.js 24, the Chromium of VS Code): numbers are
// written back with their own digits, so pretty printing never rounds a big or exact number.
interface SourceContext {
  readonly source: string
}

interface JsonWithSource {
  readonly parse: (
    text: string,
    reviver: (key: string, value: unknown, context: SourceContext) => unknown,
  ) => unknown
  readonly rawJSON: (text: string) => unknown
}

const JSON_WITH_SOURCE = JSON as unknown as JsonWithSource
const INDENT = 2
const CONTAINER_STARTS: ReadonlySet<string> = new Set(['{', '['])

// The JSON object or array in `text`, indented; undefined when the text is not one.
export function prettyJson(text: string): string | undefined {
  const trimmed = text.trim()
  if (!CONTAINER_STARTS.has(trimmed.charAt(0))) {
    return undefined
  }
  try {
    return JSON.stringify(parseKeepingNumbers(trimmed), null, INDENT)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

function parseKeepingNumbers(text: string): unknown {
  return JSON_WITH_SOURCE.parse(text, (...[, value, context]) =>
    typeof value === 'number' ? JSON_WITH_SOURCE.rawJSON(context.source) : value,
  )
}
