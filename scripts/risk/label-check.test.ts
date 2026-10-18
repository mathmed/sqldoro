import { describe, expect, it } from 'vitest'

import { RiskFloorError } from './floors.ts'
import { labelProblem, parseLabels } from './label-check.ts'
import { RiskLevel } from './levels.ts'

describe('parseLabels', () => {
  it('should read the labels GitHub Actions gives as JSON', () => {
    expect(parseLabels('["bug","risk:high"]')).toEqual(['bug', 'risk:high'])
    expect(parseLabels('[]')).toEqual([])
    expect(parseLabels('')).toEqual([])
  })

  it.each(['{}', '[1]', '"risk:high"', 'null'])('should reject %s', (json) => {
    expect(() => parseLabels(json)).toThrow(RiskFloorError)
    expect(() => parseLabels(json)).toThrow(
      `--labels-json must be a JSON list of strings, got: ${json}`,
    )
  })
})

describe('labelProblem', () => {
  it('should accept one risk label at or above the floor, whatever the other labels', () => {
    expect(labelProblem(['bug', 'risk:high'], RiskLevel.High)).toBeUndefined()
    expect(labelProblem(['risk:critical'], RiskLevel.High)).toBeUndefined()
    expect(labelProblem(['risk:low'], RiskLevel.Low)).toBeUndefined()
  })

  it('should require a risk label', () => {
    expect(labelProblem(['bug'], RiskLevel.Low)).toBe(
      'expected exactly one risk label (risk:low, risk:medium, risk:high, risk:critical), found: none',
    )
  })

  it('should refuse more than one risk label', () => {
    expect(labelProblem(['risk:low', 'risk:high'], RiskLevel.Low)).toBe(
      'expected exactly one risk label (risk:low, risk:medium, risk:high, risk:critical), found: risk:low, risk:high',
    )
  })

  it('should refuse an unknown risk label', () => {
    expect(labelProblem(['risk:severe'], RiskLevel.Low)).toBe(
      'unknown risk label risk:severe: use one of risk:low, risk:medium, risk:high, risk:critical',
    )
  })

  it('should refuse a label below the floor', () => {
    expect(labelProblem(['risk:medium'], RiskLevel.High)).toBe(
      'risk:medium is below the floor of this PR (risk:high)',
    )
  })
})
