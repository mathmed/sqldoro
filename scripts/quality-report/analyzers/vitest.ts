import { cleanOutput, linesMatching } from '../../shared/text.ts'
import {
  finding,
  type Finding,
  markdownDetails,
  type Metric,
  textDetails,
  withMetric,
} from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'
import { failures, testCounts } from './test-counts.ts'

const COVERAGE_METRIC = /^(Statements|Branches|Functions|Lines)\s*:\s*([\d.]+)%/gm
const THRESHOLD_ERROR = /^ERROR: Coverage for /
const COVERAGE_TABLE_ROW = /^\s*[^\s|][^|]*\|.*\|/
const COVERAGE_DECIMALS = 2

interface Coverage {
  readonly name: string
  readonly percent: number
}

export function analyzeVitest(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const counts = testCounts(output)
  if (counts === undefined) {
    return finding(Status.Failed, 'Vitest failed before finishing', textDetails('Output', output))
  }
  const coverage = coverageOf(output)
  const counted = `${String(counts.passed)} passed, ${String(counts.failed)} failed`
  const summary = coverage.length === 0 ? `${counted} · coverage n/a` : counted
  return withCoverage(testsFinding({ fragment, output, summary, failed: counts.failed }), coverage)
}

interface TestsOutcome {
  readonly fragment: Fragment
  readonly output: string
  readonly summary: string
  readonly failed: number
}

function testsFinding({ fragment, output, summary, failed }: TestsOutcome): Finding {
  if (failed > 0) {
    return finding(Status.Failed, summary, textDetails('Failures', failures(output)))
  }
  if (!hasPassed(fragment)) {
    return thresholdFinding(output, summary)
  }
  return finding(Status.Ok, summary, markdownDetails('Coverage', coverageText(coverageOf(output))))
}

function coverageOf(output: string): Coverage[] {
  return [...output.matchAll(COVERAGE_METRIC)].map(([, name = '', value = '']) => ({
    name: name.toLowerCase(),
    percent: Number(value),
  }))
}

function coverageText(coverage: readonly Coverage[]): string {
  return coverage.map(({ name, percent }) => `${name} ${String(percent)}%`).join(' · ')
}

// The lowest of the four: the one a 100% ratchet fails on first.
function withCoverage(result: Finding, coverage: readonly Coverage[]): Finding {
  if (coverage.length === 0) {
    return result
  }
  const lowest = Math.min(...coverage.map(({ percent }) => percent))
  const metric: Metric = {
    label: 'coverage',
    value: lowest,
    unit: '%',
    decimals: COVERAGE_DECIMALS,
  }
  return withMetric(result, metric)
}

function thresholdFinding(output: string, summary: string): Finding {
  const errors = linesMatching(THRESHOLD_ERROR, output)
  if (errors.length === 0) {
    return finding(Status.Failed, `${summary} · Vitest failed`, textDetails('Output', output))
  }
  const table = linesMatching(COVERAGE_TABLE_ROW, output)
  const details = [...table, ...errors].join('\n')
  return finding(
    Status.Failed,
    `${summary} · coverage below the thresholds (${coverageText(coverageOf(output))})`,
    textDetails('Coverage', details),
  )
}
