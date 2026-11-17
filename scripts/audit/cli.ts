import { plural } from '../shared/text.ts'
import { type AuditVerdict, describeAdvisory, evaluateAudit } from './evaluate.ts'
import type { AuditException } from './exceptions.ts'
import { readAdvisories } from './report.ts'

const USAGE_ERROR = 2
const USAGE = `usage:
  audit check
      run npm audit on every dependency and fail on any advisory that no temporary exception of
      scripts/audit/exceptions.ts accepts, on an expired, changed, stale or invalid exception`

export interface AuditContext {
  readonly runAudit: () => Promise<string>
  readonly exceptions: readonly AuditException[]
  // YYYY-MM-DD, UTC.
  readonly today: string
}

export async function main(argv: readonly string[], context: AuditContext): Promise<number> {
  if (argv.length !== 1 || argv[0] !== 'check') {
    console.error(`unknown command "${argv.join(' ')}"\n${USAGE}`)
    return USAGE_ERROR
  }
  const verdict = evaluateAudit(
    readAdvisories(await context.runAudit()),
    context.exceptions,
    context.today,
  )
  printVerdict(verdict)
  return verdict.problems.length === 0 ? 0 : 1
}

function printVerdict({ accepted, problems }: AuditVerdict): void {
  for (const advisory of accepted) {
    console.log(`Accepted by a temporary exception: ${describeAdvisory(advisory)}`)
  }
  for (const problem of problems) {
    console.log(problem)
  }
  const found = plural(problems.length, 'audit problem', 'audit problems')
  const tolerated = plural(accepted.length, 'vulnerability', 'vulnerabilities')
  console.log(`${found}, ${tolerated} accepted by a temporary exception.`)
}
