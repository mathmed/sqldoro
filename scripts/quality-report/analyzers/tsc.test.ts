import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeTsc } from './tsc.ts'

function tsc(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Tsc, exitCode, output, seconds: 1 }
}

describe('analyzeTsc', () => {
  it('should be ok without type errors', () => {
    expect(analyzeTsc(tsc('', 0))).toStrictEqual({ status: Status.Ok, summary: 'No type errors' })
  })

  it('should count and list the type errors', () => {
    const output = [
      '> tsc -p tsconfig.json && tsc -p tsconfig.core.json',
      "src/core/a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/core/a.ts(2,31): error TS2322: Type 'number' is not assignable to type 'string'.",
    ].join('\n')

    const sut = analyzeTsc(tsc(output, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('2 type errors')
    expect(sut.details?.body.split('\n')).toHaveLength(2)
  })

  it('should show the output when tsc fails without type errors', () => {
    const sut = analyzeTsc(tsc('error: unknown compiler option', 1))

    expect(sut.summary).toBe('tsc failed')
    expect(sut.details?.body).toBe('error: unknown compiler option')
  })
})
