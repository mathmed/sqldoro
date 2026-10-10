import { cleanOutput } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'
import { failures, testCounts } from './test-counts.ts'

// The drivers and the SSH tunnel against real servers (vitest.integration.config.ts).
export function analyzeIntegration(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const counts = testCounts(output)
  if (counts === undefined) {
    return finding(
      Status.Failed,
      'The integration tests did not run',
      textDetails('Output', output),
    )
  }
  const summary = `${String(counts.passed)} passed, ${String(counts.failed)} failed against real MySQL, PostgreSQL and SSH servers`
  if (counts.failed > 0) {
    return finding(Status.Failed, summary, textDetails('Failures', failures(output)))
  }
  if (!hasPassed(fragment)) {
    return finding(Status.Failed, `${summary} · Vitest failed`, textDetails('Output', output))
  }
  return finding(Status.Ok, summary)
}
