import { cleanOutput } from '../shared/text.ts'
import type { Analysis } from './analysis.ts'
import { finding, type Finding, textDetails } from './finding.ts'
import { type Fragment, hasPassed } from './fragment.ts'
import { JobResult, type JobResults } from './job-results.ts'
import type { Check, Job, Section } from './sections.ts'
import { Status, worst } from './status.ts'

export interface CheckResult {
  readonly check: Check
  readonly finding: Finding
  readonly seconds: number
}

export interface SectionResult {
  readonly section: Section
  readonly status: Status
  readonly results: readonly CheckResult[]
}

export interface Evidence {
  readonly fragments: ReadonlyMap<Analysis, Fragment>
  readonly jobResults: JobResults
}

export function evaluate(section: Section, evidence: Evidence): SectionResult {
  const results = section.checks.map((check) => evaluateCheck(check, evidence))
  return { section, status: worst(results.map((result) => result.finding.status)), results }
}

function evaluateCheck(check: Check, { fragments, jobResults }: Evidence): CheckResult {
  const fragment = fragments.get(check.analysis)
  if (fragment === undefined) {
    return { check, finding: missingFinding(check.job, jobResults), seconds: 0 }
  }
  return { check, finding: analyzeSafely(check, fragment), seconds: fragment.seconds }
}

function missingFinding(job: Job, jobResults: JobResults): Finding {
  const result = jobResults.get(job)
  if (result === undefined) {
    return finding(Status.Skipped, `Job \`${job}\` did not run: analysis not run`)
  }
  if (result === JobResult.Cancelled || result === JobResult.Skipped) {
    return finding(Status.Skipped, `Job \`${job}\` was ${result}: analysis not run`)
  }
  if (result === JobResult.Success) {
    return finding(Status.Warning, `Job \`${job}\` passed but did not upload this result`)
  }
  return finding(
    Status.Failed,
    `Job \`${job}\` ended as \`${result}\` before running this analysis`,
  )
}

// A tool can print something its analyzer has never seen; the report then falls back to the exit
// code and the raw output instead of losing the whole comment.
function analyzeSafely(check: Check, fragment: Fragment): Finding {
  try {
    return check.analyze(fragment)
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) {
      throw error
    }
    console.warn(`could not analyse ${check.analysis}: ${error.message}`)
    return unsummarisedFinding(fragment)
  }
}

function unsummarisedFinding(fragment: Fragment): Finding {
  const output = textDetails('Output', cleanOutput(fragment.output))
  if (hasPassed(fragment)) {
    return finding(Status.Ok, 'passed; the output could not be summarised', output)
  }
  const verdict = `failed (exit code ${String(fragment.exitCode)})`
  return finding(Status.Failed, `${verdict}; the output could not be summarised`, output)
}
