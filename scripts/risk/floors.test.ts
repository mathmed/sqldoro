import { describe, expect, it } from 'vitest'

import { assess, describeAssessment, type Floor, parseFloors, RiskFloorError } from './floors.ts'
import { RiskLevel } from './levels.ts'

const FLOORS: readonly Floor[] = [
  { category: 'pipeline config', level: RiskLevel.High, patterns: ['scripts/**', '.github/**'] },
  { category: 'docs', level: RiskLevel.Medium, patterns: ['docs/*.md'] },
  { category: 'secrets', level: RiskLevel.Critical, patterns: ['**/*[sS]ecret*'] },
]

describe('parseFloors', () => {
  it('should read each category with its level and paths', () => {
    const sut = parseFloors(
      [
        'floors:',
        '  - category: pipeline config',
        '    level: high',
        '    paths:',
        '      - scripts/**',
        '      - Makefile',
      ].join('\n'),
    )

    expect(sut).toEqual([
      { category: 'pipeline config', level: 'high', patterns: ['scripts/**', 'Makefile'] },
    ])
  })

  it.each([
    ['', 'the risk floors need a top-level `floors` list'],
    ['- a', 'the risk floors need a top-level `floors` list'],
    ['floors: {}', 'the risk floors need a top-level `floors` list'],
    ['floors: [a]', 'each floor must be a mapping, got: "a"'],
    ['floors: [[a]]', 'each floor must be a mapping, got: ["a"]'],
    [
      'floors: [{ level: high, paths: [a] }]',
      'each floor needs a category and a non-empty list of paths',
    ],
    [
      'floors: [{ category: c, level: high, paths: [] }]',
      'each floor needs a category and a non-empty list of paths',
    ],
    [
      'floors: [{ category: c, level: high, paths: a }]',
      'each floor needs a category and a non-empty list of paths',
    ],
    [
      'floors: [{ category: c, level: high, paths: [1] }]',
      'each floor needs a category and a non-empty list of paths',
    ],
    [
      'floors: [{ category: c, level: severe, paths: [a] }]',
      'unknown level "severe" in the floor "c"',
    ],
    ['floors: [{ category: c, paths: [a] }]', 'unknown level undefined in the floor "c"'],
  ])('should reject %j', (text, message) => {
    expect(() => parseFloors(text)).toThrow(RiskFloorError)
    expect(() => parseFloors(text)).toThrow(message)
  })
})

describe('assess', () => {
  it('should take the highest level of the categories the files match, with the files behind each', () => {
    const files = [
      'scripts/risk.ts',
      '.github/workflows/ci.yml',
      'src/core/connection/secrets.ts',
      'README.md',
    ]

    const sut = assess(files, FLOORS)

    expect(sut).toEqual({
      floor: RiskLevel.Critical,
      hits: [
        {
          category: 'pipeline config',
          level: RiskLevel.High,
          files: ['scripts/risk.ts', '.github/workflows/ci.yml'],
        },
        {
          category: 'secrets',
          level: RiskLevel.Critical,
          files: ['src/core/connection/secrets.ts'],
        },
      ],
    })
  })

  it('should keep a single segment for `*` and match no name that starts with a dot', () => {
    const sut = assess(['docs/a/b.md', 'docs/.hidden.md', 'src/.secret'], FLOORS)

    expect(sut).toEqual({ floor: RiskLevel.Low, hits: [] })
  })

  it('should be low when nothing matches', () => {
    expect(assess(['README.md'], FLOORS).floor).toBe(RiskLevel.Low)
    expect(assess([], FLOORS).floor).toBe(RiskLevel.Low)
  })
})

describe('describeAssessment', () => {
  it('should print the floor and the files of each category', () => {
    const sut = describeAssessment(assess(['scripts/a.ts', 'docs/b.md'], FLOORS))

    expect(sut).toBe(
      [
        'Risk floor: high',
        '- pipeline config (high): scripts/a.ts',
        '- docs (medium): docs/b.md',
      ].join('\n'),
    )
  })

  it('should say when no file matches a floor', () => {
    expect(describeAssessment(assess(['README.md'], FLOORS))).toBe(
      'Risk floor: low\n- no file matches a floor category',
    )
  })
})
