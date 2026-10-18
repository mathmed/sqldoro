import { describe, expect, it } from 'vitest'

import { SuppressionKind } from './kinds.ts'
import { type Comparison, decreasesOf, increasesOf, reportLines, resultOf } from './report.ts'

const ADDED = {
  path: 'src/a.ts',
  kind: SuppressionKind.EslintDisable,
  baseline: 1,
  current: 2,
  lines: [4, 8],
}
const REMOVED = {
  path: 'test/b.ts',
  kind: SuppressionKind.TestSkip,
  baseline: 1,
  current: 0,
  lines: [],
}

const COMPARISON: Comparison = {
  current: new Map([
    [
      'src/a.ts',
      new Map([
        [SuppressionKind.TsIgnore, 1],
        [SuppressionKind.EslintDisable, 2],
      ]),
    ],
  ]),
  baseline: new Map<string, ReadonlyMap<SuppressionKind, number>>([
    ['src/a.ts', new Map([[SuppressionKind.EslintDisable, 1]])],
    ['test/b.ts', new Map([[SuppressionKind.TestSkip, 1]])],
  ]),
  changes: [ADDED, REMOVED],
}

describe('suppression report', () => {
  it('should split the changes into increases and decreases', () => {
    expect(increasesOf(COMPARISON)).toEqual([ADDED])
    expect(decreasesOf(COMPARISON)).toEqual([REMOVED])
  })

  it('should print the totals, then the new and the removed suppressions with their lines', () => {
    expect(reportLines(COMPARISON)).toEqual([
      'Suppressions: 3 (baseline 2)',
      '  eslint-disable: 2',
      '  ts-ignore: 1',
      'New suppressions (remove them, or get the owner’s approval to raise the baseline):',
      '  src/a.ts: eslint-disable 1 -> 2 (lines: 4, 8)',
      'Suppressions removed (lock the improvement in with `make suppressions-update`):',
      '  test/b.ts: test-skip 1 -> 0 (lines: -)',
    ])
  })

  it('should only print the totals when nothing changed', () => {
    const sut = reportLines({ current: new Map(), baseline: new Map(), changes: [] })

    expect(sut).toEqual(['Suppressions: 0 (baseline 0)'])
  })

  it('should give the Quality Report the totals and every change', () => {
    expect(resultOf(COMPARISON)).toEqual({
      total: 3,
      baselineTotal: 2,
      totals: [
        { kind: 'eslint-disable', count: 2 },
        { kind: 'ts-ignore', count: 1 },
      ],
      changes: [ADDED, REMOVED],
    })
  })
})
