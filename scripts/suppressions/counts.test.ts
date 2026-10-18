import { describe, expect, it } from 'vitest'

import {
  changesOf,
  countOccurrences,
  formatBaseline,
  isIncrease,
  parseBaseline,
  totalOf,
  totalsByKind,
} from './counts.ts'
import { SuppressionKind } from './kinds.ts'
import type { Occurrence } from './scan.ts'

const OCCURRENCES: readonly Occurrence[] = [
  { path: 'src/b.ts', line: 3, kind: SuppressionKind.TsExpectError },
  { path: 'src/b.ts', line: 7, kind: SuppressionKind.EslintDisable },
  { path: 'src/a.ts', line: 1, kind: SuppressionKind.EslintDisable },
  { path: 'src/a.ts', line: 9, kind: SuppressionKind.EslintDisable },
]

describe('suppression counts', () => {
  it('should count the suppressions of each kind in each file', () => {
    const sut = countOccurrences(OCCURRENCES)

    expect(sut).toEqual(
      new Map([
        [
          'src/b.ts',
          new Map([
            [SuppressionKind.TsExpectError, 1],
            [SuppressionKind.EslintDisable, 1],
          ]),
        ],
        ['src/a.ts', new Map([[SuppressionKind.EslintDisable, 2]])],
      ]),
    )
    expect(totalOf(sut)).toBe(4)
    expect(totalOf(new Map())).toBe(0)
  })

  it('should total each kind in the order of the kinds', () => {
    const sut = totalsByKind(countOccurrences(OCCURRENCES))

    expect([...sut]).toEqual([
      [SuppressionKind.EslintDisable, 3],
      [SuppressionKind.TsExpectError, 1],
    ])
  })

  it('should list each file and kind that went up or down, with the lines where they are', () => {
    const baseline = new Map<string, ReadonlyMap<SuppressionKind, number>>([
      ['src/a.ts', new Map([[SuppressionKind.EslintDisable, 1]])],
      ['src/b.ts', new Map([[SuppressionKind.EslintDisable, 1]])],
      ['src/gone.ts', new Map([[SuppressionKind.TestSkip, 2]])],
    ])

    const sut = changesOf(OCCURRENCES, baseline)

    expect(sut).toEqual([
      {
        path: 'src/a.ts',
        kind: SuppressionKind.EslintDisable,
        baseline: 1,
        current: 2,
        lines: [1, 9],
      },
      {
        path: 'src/b.ts',
        kind: SuppressionKind.TsExpectError,
        baseline: 0,
        current: 1,
        lines: [3],
      },
      { path: 'src/gone.ts', kind: SuppressionKind.TestSkip, baseline: 2, current: 0, lines: [] },
    ])
    expect(sut.map(isIncrease)).toEqual([true, true, false])
  })

  it('should list nothing when the counts match the baseline', () => {
    expect(changesOf(OCCURRENCES, countOccurrences(OCCURRENCES))).toEqual([])
  })
})

describe('suppression baseline', () => {
  it('should write the files and their kinds sorted, in the JSON Prettier keeps', () => {
    const sut = formatBaseline(countOccurrences(OCCURRENCES))

    expect(sut).toBe(
      [
        '{',
        '  "src/a.ts": {',
        '    "eslint-disable": 2',
        '  },',
        '  "src/b.ts": {',
        '    "eslint-disable": 1,',
        '    "ts-expect-error": 1',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('should write an empty object when nothing is suppressed', () => {
    expect(formatBaseline(new Map())).toBe('{}\n')
  })

  it('should read back what it writes', () => {
    const counts = countOccurrences(OCCURRENCES)

    expect(formatBaseline(parseBaseline(formatBaseline(counts)))).toBe(formatBaseline(counts))
    expect(parseBaseline(formatBaseline(counts)).get('src/a.ts')).toEqual(
      new Map([[SuppressionKind.EslintDisable, 2]]),
    )
  })

  it('should reject a baseline with an unknown kind', () => {
    expect(() => parseBaseline('{ "src/a.ts": { "noqa": 1 } }')).toThrow(
      'unknown suppression kind "noqa" for src/a.ts in the baseline',
    )
  })

  it.each(['0', '-1', '1.5', '"1"', 'null'])('should reject a count of %s', (count) => {
    expect(() => parseBaseline(`{ "src/a.ts": { "ts-ignore": ${count} } }`)).toThrow(
      'expected a positive count of ts-ignore for src/a.ts in the baseline',
    )
  })

  it('should reject a baseline that is not an object of objects', () => {
    expect(() => parseBaseline('[]')).toThrow('expected a JSON object')
    expect(() => parseBaseline('{ "src/a.ts": 1 }')).toThrow('expected a JSON object')
  })
})
