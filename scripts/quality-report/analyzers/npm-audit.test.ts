import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeNpmAudit } from './npm-audit.ts'

const ADVISORIES = `# npm audit report

qs  2.2.5 - 6.15.3
Severity: moderate
qs has a remotely triggerable DoS - https://github.com/advisories/GHSA-q8mj-m7cp-5q26
fix available via \`npm audit fix\`
node_modules/qs

2 moderate severity vulnerabilities

To address all issues, run:
  npm audit fix`

function audit(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.NpmAudit, exitCode, output, seconds: 1 }
}

describe('analyzeNpmAudit', () => {
  it('should be ok without known vulnerabilities', () => {
    expect(analyzeNpmAudit(audit('found 0 vulnerabilities', 0))).toStrictEqual({
      status: Status.Ok,
      summary: 'No known vulnerabilities',
    })
  })

  it('should summarise the vulnerabilities and keep the advisories', () => {
    const sut = analyzeNpmAudit(audit(ADVISORIES, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('2 moderate severity vulnerabilities')
    expect(sut.details?.body).toContain('GHSA-q8mj-m7cp-5q26')
  })

  it('should read the mixed severity summary too', () => {
    const output = '3 vulnerabilities (1 low, 2 high)'

    expect(analyzeNpmAudit(audit(output, 1)).summary).toBe(output)
  })

  it('should say npm audit failed when it could not audit', () => {
    expect(analyzeNpmAudit(audit('npm error audit endpoint returned an error', 1)).summary).toBe(
      'npm audit failed',
    )
  })
})
