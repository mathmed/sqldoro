import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeVitest } from './vitest.ts'

const COVERAGE_SUMMARY = `=============================== Coverage summary ===============================
Statements   : 100% ( 11/11 )
Branches     : 100% ( 2/2 )
Functions    : 100% ( 4/4 )
Lines        : 100% ( 11/11 )
================================================================================`

const PASSED = ` RUN  v5.0.3 /home/runner/work/sqldoro/sqldoro
      Coverage enabled with v8

 Test Files  2 passed (2)
      Tests  7 passed (7)
   Duration  231ms

 % Coverage report from v8
No files with missing coverage.

${COVERAGE_SUMMARY}`

const FAILED_TEST = ` ❯ src/core/greeting.test.ts (2 tests | 1 failed) 12ms
     × should greet without a suffix in an installed build 10ms

 FAIL  src/core/greeting.test.ts > buildGreeting > should greet without a suffix
AssertionError: expected 'Hello from sqldoro!' to be 'Hello!'

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 6 passed (7)`

const LOW_COVERAGE = ` Test Files  2 passed (2)
      Tests  7 passed (7)

----------------|---------|----------|---------|---------|-------------------
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------|---------|----------|---------|---------|-------------------
All files       |   91.66 |       50 |      80 |   91.66 |
  probe.ts      |       0 |        0 |       0 |       0 | 2
----------------|---------|----------|---------|---------|-------------------
Statements   : 91.66% ( 11/12 )
Branches     : 50% ( 2/4 )
Functions    : 80% ( 4/5 )
Lines        : 91.66% ( 11/12 )
ERROR: Coverage for lines (91.66%) does not meet global threshold (100%)
ERROR: Coverage for branches (50%) does not meet global threshold (100%)`

function vitest(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Vitest, exitCode, output, seconds: 1 }
}

describe('analyzeVitest', () => {
  it('should report the test counts and the coverage', () => {
    expect(analyzeVitest(vitest(PASSED, 0))).toStrictEqual({
      status: Status.Ok,
      summary:
        '7 passed, 0 failed · coverage statements 100% / branches 100% / functions 100% / lines 100%',
    })
  })

  it('should list the failed tests', () => {
    const sut = analyzeVitest(vitest(FAILED_TEST, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('6 passed, 1 failed · coverage n/a')
    expect(sut.details?.body).toBe(
      [
        '     × should greet without a suffix in an installed build 10ms',
        ' FAIL  src/core/greeting.test.ts > buildGreeting > should greet without a suffix',
      ].join('\n'),
    )
  })

  it('should show the whole output when a failure has no FAIL line', () => {
    const output = '      Tests  1 failed (1)'

    expect(analyzeVitest(vitest(output, 1)).details?.body).toBe(output)
  })

  it('should fail with the coverage table when coverage is below the thresholds', () => {
    const sut = analyzeVitest(vitest(LOW_COVERAGE, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe(
      '7 passed, 0 failed · coverage statements 91.66% / branches 50% / functions 80% / lines 91.66% · coverage below the thresholds',
    )
    expect(sut.details?.body).toContain('probe.ts      |       0 |')
    expect(sut.details?.body).toContain(
      'ERROR: Coverage for branches (50%) does not meet global threshold (100%)',
    )
  })

  it('should fail when Vitest exits with an error after passing every test', () => {
    const sut = analyzeVitest(vitest(`${PASSED}\nError: cannot write the report`, 1))

    expect(sut.summary).toMatch(/· Vitest failed$/)
    expect(sut.details?.body).toContain('cannot write the report')
  })

  it('should fail when Vitest stops before running the tests', () => {
    const sut = analyzeVitest(vitest('Error: failed to load vitest.config.ts', 1))

    expect(sut.summary).toBe('Vitest failed before finishing')
    expect(sut.details?.body).toBe('Error: failed to load vitest.config.ts')
  })
})
