// Dependency audit (see "Dependency audit" in CONTRIBUTING.md).
//   check   runs npm audit and fails on any advisory no temporary exception accepts, and on an
//           expired, changed, stale or invalid exception (scripts/audit/exceptions.ts)
import { main } from './audit/cli.ts'
import { AUDIT_EXCEPTIONS } from './audit/exceptions.ts'
import { auditReport } from './audit/npm.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2
// YYYY-MM-DD of an ISO 8601 UTC timestamp.
const DATE_LENGTH = 10

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), {
  runAudit: async () => auditReport(['npm', 'audit', '--json']),
  exceptions: AUDIT_EXCEPTIONS,
  today: new Date().toISOString().slice(0, DATE_LENGTH),
})
