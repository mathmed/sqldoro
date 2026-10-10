import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeIntegration } from './integration.ts'

// Output of `npm run test:integration` against the test containers.
const PASSED = `> sqldoro@0.0.1 test:integration
> vitest run --config vitest.integration.config.ts


 RUN  v5.0.3 /home/runner/work/sqldoro/sqldoro


 Test Files  3 passed (3)
      Tests  42 passed (42)
   Start at  01:30:24
   Duration  7.79s (tests 59%, transform 22%, import 18%, worker 1%)`

const FAILED = ` ❯ src/drivers/mysql/mysql-engine.integration.test.ts (17 tests | 1 failed) 412ms
     × should show the server message for a wrong password 12ms

 FAIL  src/drivers/mysql/mysql-engine.integration.test.ts > mysqlEngine against a real MySQL server > should show the server message for a wrong password
AssertionError: expected [Function] to throw error matching /Access denied/

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 41 passed (42)`

function integration(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Integration, exitCode, output, seconds: 12 }
}

describe('analyzeIntegration', () => {
  it('should count the tests that ran against the real servers', () => {
    expect(analyzeIntegration(integration(PASSED, 0))).toStrictEqual({
      status: Status.Ok,
      summary: '42 passed, 0 failed against real MySQL, PostgreSQL and SSH servers',
    })
  })

  it('should list the failed tests', () => {
    const sut = analyzeIntegration(integration(FAILED, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('41 passed, 1 failed against real MySQL, PostgreSQL and SSH servers')
    expect(sut.details?.body).toBe(
      [
        '     × should show the server message for a wrong password 12ms',
        ' FAIL  src/drivers/mysql/mysql-engine.integration.test.ts > mysqlEngine against a real MySQL server > should show the server message for a wrong password',
      ].join('\n'),
    )
  })

  it('should fail when Vitest exits with an error after passing every test', () => {
    const sut = analyzeIntegration(integration(`${PASSED}\nError: the servers went away`, 1))

    expect(sut.summary).toBe(
      '42 passed, 0 failed against real MySQL, PostgreSQL and SSH servers · Vitest failed',
    )
    expect(sut.details?.body).toContain('the servers went away')
  })

  it('should fail when the tests did not run', () => {
    const sut = analyzeIntegration(integration('Error: connect ECONNREFUSED 127.0.0.1:33306', 1))

    expect(sut).toStrictEqual({
      status: Status.Failed,
      summary: 'The integration tests did not run',
      details: {
        title: 'Output',
        body: 'Error: connect ECONNREFUSED 127.0.0.1:33306',
        format: 'text',
      },
    })
  })
})
