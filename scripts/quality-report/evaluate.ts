import { cleanOutput } from '../shared/text.ts'
import type { Analysis } from './analysis.ts'
import { finding, type Finding, textDetails } from './finding.ts'
import { type Fragment, hasPassed } from './fragment.ts'
import { JobResult, type JobResults } from './job-results.ts'
import { renderMetric } from './metric.ts'
import type { Check, Job, Section } from './sections.ts'
import { Status, worst } from './status.ts'

export interface CheckResult {
  readonly check: Check
  readonly finding: Finding
  // The same check on the last run of the base branch, when that run left its fragment.
  readonly base: Finding | undefined
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
  readonly baseFragments: ReadonlyMap<Analysis, Fragment>
}

export function evaluate(section: Section, evidence: Evidence): SectionResult {
  const results = section.checks.map((check) => evaluateCheck(check, evidence))
  return { section, status: worst(results.map((result) => result.finding.status)), results }
}

function evaluateCheck(check: Check, evidence: Evidence): CheckResult {
  const fragment = evidence.fragments.get(check.analysis)
  const baseFragment = evidence.baseFragments.get(check.analysis)
  const base = baseFragment === undefined ? undefined : analyzeSafely(check, baseFragment)
  if (fragment === undefined) {
    return { check, finding: missingFinding(check.job, evidence.jobResults), base, seconds: 0 }
  }
  return { check, finding: analyzeSafely(check, fragment), base, seconds: fragment.seconds }
}

// A failure the base branch also had: the same analysis failed there (maybe on other findings).
export function isInherited({ finding: current, base }: CheckResult): boolean {
  return current.status === Status.Failed && base?.status === Status.Failed
}

export function isSectionInherited({ results }: SectionResult): boolean {
  const failed = results.filter((result) => result.finding.status === Status.Failed)
  return failed.length > 0 && failed.every(isInherited)
}

// The one-line detail of a check: its summary, and its metric compared with the base branch.
export function checkDetail({ finding: current, base }: CheckResult): string {
  if (current.metric === undefined) {
    return current.summary
  }
  return `${current.summary} · ${renderMetric(current.metric, base?.metric)}`
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
