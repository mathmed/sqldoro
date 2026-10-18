import { ARRAY, field, NUMBER, parseObject, STRING } from './json.ts'

// scripts/suppressions.ts prints this line; the suppressions analyzer of the Quality Report reads it.
const SUPPRESSIONS_RESULT_PREFIX = 'SUPPRESSIONS_RESULT: '

interface KindTotal {
  readonly kind: string
  readonly count: number
}

export interface SuppressionChange {
  readonly path: string
  readonly kind: string
  readonly baseline: number
  readonly current: number
  readonly lines: readonly number[]
}

export interface SuppressionsResult {
  readonly total: number
  readonly baselineTotal: number
  readonly totals: readonly KindTotal[]
  readonly changes: readonly SuppressionChange[]
}

export function formatSuppressionsLine(result: SuppressionsResult): string {
  return `${SUPPRESSIONS_RESULT_PREFIX}${JSON.stringify(result)}`
}

export function parseSuppressionsLine(output: string): SuppressionsResult | undefined {
  const line = output
    .split('\n')
    .find((candidate) => candidate.startsWith(SUPPRESSIONS_RESULT_PREFIX))
  if (line === undefined) {
    return undefined
  }
  return parseResult(JSON.parse(line.slice(SUPPRESSIONS_RESULT_PREFIX.length)))
}

function parseResult(value: unknown): SuppressionsResult {
  const result = parseObject(value)
  return {
    total: field(result, 'total', NUMBER),
    baselineTotal: field(result, 'baselineTotal', NUMBER),
    totals: field(result, 'totals', ARRAY).map(parseKindTotal),
    changes: field(result, 'changes', ARRAY).map(parseChange),
  }
}

function parseKindTotal(value: unknown): KindTotal {
  const total = parseObject(value)
  return { kind: field(total, 'kind', STRING), count: field(total, 'count', NUMBER) }
}

function parseChange(value: unknown): SuppressionChange {
  const change = parseObject(value)
  const lines = field(change, 'lines', ARRAY)
  if (!lines.every((line) => typeof line === 'number')) {
    throw new TypeError('expected "lines" to list line numbers')
  }
  return {
    path: field(change, 'path', STRING),
    kind: field(change, 'kind', STRING),
    baseline: field(change, 'baseline', NUMBER),
    current: field(change, 'current', NUMBER),
    lines,
  }
}
