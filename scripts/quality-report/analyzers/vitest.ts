import { cleanOutput, linesMatching, orElse } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

interface TestCounts {
  readonly passed: number
  readonly failed: number
}

// "      Tests  1 failed | 6 passed (7)"
const TESTS_LINE = /^[ \t]*Tests[ \t]+(\S.*)$/m
const COVERAGE_METRIC = /^(Statements|Branches|Functions|Lines)\s*:\s*([\d.]+)%/gm
const FAILED_TEST = /^\s*(?:FAIL|×)\s/
const THRESHOLD_ERROR = /^ERROR: Coverage for /
const COVERAGE_TABLE_ROW = /^\s*[^\s|][^|]*\|.*\|/

export function analyzeVitest(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const counts = testCounts(output)
  if (counts === undefined) {
    return finding(Status.Failed, 'Vitest failed before finishing', textDetails('Output', output))
  }
  const summary = `${String(counts.passed)} passed, ${String(counts.failed)} failed · coverage ${coverageOf(output)}`
  if (counts.failed > 0) {
    const failures = orElse(linesMatching(FAILED_TEST, output).join('\n'), output)
    return finding(Status.Failed, summary, textDetails('Failures', failures))
  }
  if (!hasPassed(fragment)) {
    return thresholdFinding(output, summary)
  }
  return finding(Status.Ok, summary)
}

function testCounts(output: string): TestCounts | undefined {
  const line = TESTS_LINE.exec(output)?.[1]
  if (line === undefined) {
    return undefined
  }
  return { passed: countOf(line, 'passed'), failed: countOf(line, 'failed') }
}

function countOf(line: string, outcome: string): number {
  const counts = line.split('|').map((part) => part.trim().split(' '))
  const [count = '0'] = counts.find(([, word]) => word === outcome) ?? []
  return Number(count)
}

function coverageOf(output: string): string {
  const metrics = [...output.matchAll(COVERAGE_METRIC)].map(
    ([, name = '', value = '']) => `${name.toLowerCase()} ${value}%`,
  )
  return metrics.length === 0 ? 'n/a' : metrics.join(' / ')
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
    `${summary} · coverage below the thresholds`,
    textDetails('Coverage', details),
  )
}
