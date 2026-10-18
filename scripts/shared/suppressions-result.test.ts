import { describe, expect, it } from 'vitest'

import {
  formatSuppressionsLine,
  parseSuppressionsLine,
  type SuppressionsResult,
} from './suppressions-result.ts'

const RESULT: SuppressionsResult = {
  total: 2,
  baselineTotal: 1,
  totals: [{ kind: 'eslint-disable', count: 2 }],
  changes: [{ path: 'src/a.ts', kind: 'eslint-disable', baseline: 1, current: 2, lines: [3, 9] }],
}

describe('suppressions result line', () => {
  it('should read back the result it prints among other lines', () => {
    const output = `Suppressions: 2 (baseline 1)\n${formatSuppressionsLine(RESULT)}\ndone`

    expect(parseSuppressionsLine(output)).toEqual(RESULT)
  })

  it('should find nothing when the line is missing', () => {
    expect(parseSuppressionsLine('Suppressions: 2')).toBeUndefined()
  })

  it('should reject a change whose lines are not numbers', () => {
    const change = { ...RESULT.changes[0], lines: ['3'] }
    const line = `SUPPRESSIONS_RESULT: ${JSON.stringify({ ...RESULT, changes: [change] })}`

    expect(() => parseSuppressionsLine(line)).toThrow('expected "lines" to list line numbers')
  })

  it('should reject a result without its totals', () => {
    const line = `SUPPRESSIONS_RESULT: ${JSON.stringify({ ...RESULT, totals: undefined })}`

    expect(() => parseSuppressionsLine(line)).toThrow('expected "totals" to be an array')
  })
})
