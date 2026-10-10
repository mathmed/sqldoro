import { linesMatching, orElse } from '../../shared/text.ts'

export interface TestCounts {
  readonly passed: number
  readonly failed: number
}

// "      Tests  1 failed | 6 passed (7)"
const TESTS_LINE = /^[ \t]*Tests[ \t]+(\S.*)$/m
const FAILED_TEST = /^\s*(?:FAIL|×)\s/

// The counts Vitest prints once it ran the tests; undefined when it stopped before.
export function testCounts(output: string): TestCounts | undefined {
  const line = TESTS_LINE.exec(output)?.[1]
  if (line === undefined) {
    return undefined
  }
  return { passed: countOf(line, 'passed'), failed: countOf(line, 'failed') }
}

// The lines that name the failed tests, or the whole output when there is none.
export function failures(output: string): string {
  return orElse(linesMatching(FAILED_TEST, output).join('\n'), output)
}

function countOf(line: string, outcome: string): number {
  const counts = line.split('|').map((part) => part.trim().split(' '))
  const [count = '0'] = counts.find(([, word]) => word === outcome) ?? []
  return Number(count)
}
