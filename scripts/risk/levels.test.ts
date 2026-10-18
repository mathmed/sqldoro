import { describe, expect, it } from 'vitest'

import { highestOf, isRiskLevel, labelOf, rankOf, RiskLevel } from './levels.ts'

describe('risk levels', () => {
  it('should rank the levels from low to critical', () => {
    expect(
      [RiskLevel.Low, RiskLevel.Medium, RiskLevel.High, RiskLevel.Critical].map(rankOf),
    ).toEqual([0, 1, 2, 3])
  })

  it('should recognise only the four levels', () => {
    expect(['low', 'medium', 'high', 'critical'].every(isRiskLevel)).toBe(true)
    expect(isRiskLevel('severe')).toBe(false)
    expect(isRiskLevel(undefined)).toBe(false)
  })

  it('should name the label of a level', () => {
    expect(labelOf(RiskLevel.High)).toBe('risk:high')
  })

  it('should take the highest level, low when there is none', () => {
    expect(highestOf([RiskLevel.Medium, RiskLevel.Critical, RiskLevel.High])).toBe(
      RiskLevel.Critical,
    )
    expect(highestOf([RiskLevel.High, RiskLevel.Medium])).toBe(RiskLevel.High)
    expect(highestOf([])).toBe(RiskLevel.Low)
  })
})
