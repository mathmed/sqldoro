import { cleanOutput } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

// npm closes its report with "<n> vulnerabilities (...)" or "<n> <severity> severity vulnerabilities",
// scripts/audit.ts with "<n> audit problems, <n> vulnerabilities accepted by a temporary exception."
const COUNT_PREFIX = /^\d+ /
const VULNERABILITY = 'vulnerabilit'

export function analyzeNpmAudit(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const summary = output
    .split('\n')
    .find((line) => COUNT_PREFIX.test(line) && line.includes(VULNERABILITY))
  if (hasPassed(fragment)) {
    return finding(Status.Ok, summary ?? 'No known vulnerabilities')
  }
  return finding(Status.Failed, summary ?? 'npm audit failed', textDetails('Advisories', output))
}
