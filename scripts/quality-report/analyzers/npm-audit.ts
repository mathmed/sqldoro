import { cleanOutput } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

// npm closes its report with "<n> vulnerabilities (...)" or "<n> <severity> severity vulnerabilities".
const COUNT_PREFIX = /^\d+ /
const VULNERABILITY = 'vulnerabilit'

export function analyzeNpmAudit(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  if (hasPassed(fragment)) {
    return finding(Status.Ok, 'No known vulnerabilities')
  }
  const summary =
    output.split('\n').find((line) => COUNT_PREFIX.test(line) && line.includes(VULNERABILITY)) ??
    'npm audit failed'
  return finding(Status.Failed, summary, textDetails('Advisories', output))
}
