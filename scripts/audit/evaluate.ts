import type { AuditException } from './exceptions.ts'
import type { Advisory } from './report.ts'

// An exception is temporary by construction: it cannot outlive this many days.
export const MAX_EXCEPTION_DAYS = 30
const MILLISECONDS_PER_DAY = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u
const EXCEPTIONS_FILE = 'scripts/audit/exceptions.ts'

export interface AuditVerdict {
  readonly accepted: readonly Advisory[]
  readonly problems: readonly string[]
}

export function evaluateAudit(
  advisories: readonly Advisory[],
  exceptions: readonly AuditException[],
  today: string,
): AuditVerdict {
  const valid = exceptions.filter((exception) => invalidity(exception) === undefined)
  const verdicts = advisories.map((advisory) => ({
    advisory,
    problem: advisoryProblem(advisory, valid, today),
  }))
  return {
    accepted: verdicts
      .filter(({ problem }) => problem === undefined)
      .map(({ advisory }) => advisory),
    problems: [
      ...verdicts.flatMap(({ problem }) => (problem === undefined ? [] : [problem])),
      ...exceptions.flatMap((exception) => exceptionProblems(exception, advisories)),
    ],
  }
}

export function describeAdvisory(advisory: Advisory): string {
  const { id, packageName, range, severity, title, url } = advisory
  return `${id} ${packageName} ${range}, ${severity}: ${title} (${url})`
}

function advisoryProblem(
  advisory: Advisory,
  exceptions: readonly AuditException[],
  today: string,
): string | undefined {
  const exception = exceptions.find((candidate) => covers(candidate, advisory))
  if (exception === undefined) {
    return `Not accepted: ${describeAdvisory(advisory)}`
  }
  if (today > exception.expires) {
    return `Expired on ${exception.expires}: the exception for ${describeAdvisory(advisory)}`
  }
  if (advisory.range !== exception.range) {
    return (
      `Changed: ${describeAdvisory(advisory)}; the exception covers ${exception.range}. A fixed ` +
      `release may be out: upgrade ${advisory.packageName} and delete the exception from ${EXCEPTIONS_FILE}`
    )
  }
  return undefined
}

function covers(exception: AuditException, advisory: Advisory): boolean {
  return exception.id === advisory.id && exception.packageName === advisory.packageName
}

function exceptionProblems(exception: AuditException, advisories: readonly Advisory[]): string[] {
  const invalid = invalidity(exception)
  if (invalid !== undefined) {
    return [`Invalid exception ${exception.id}: ${invalid}`]
  }
  if (!advisories.some((advisory) => covers(exception, advisory))) {
    return [
      `Stale exception: ${exception.id} (${exception.packageName}) is no longer reported; ` +
        `delete it from ${EXCEPTIONS_FILE}`,
    ]
  }
  return []
}

function invalidity(exception: AuditException): string | undefined {
  const days = daysBetween(exception.created, exception.expires)
  if (Number.isNaN(days)) {
    return `its dates must be YYYY-MM-DD (created ${exception.created}, expires ${exception.expires})`
  }
  if (days <= 0 || days > MAX_EXCEPTION_DAYS) {
    return `it lasts ${String(days)} days; an exception lasts 1 to ${String(MAX_EXCEPTION_DAYS)} days`
  }
  return undefined
}

function daysBetween(start: string, end: string): number {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    return Number.NaN
  }
  return (Date.parse(end) - Date.parse(start)) / MILLISECONDS_PER_DAY
}
