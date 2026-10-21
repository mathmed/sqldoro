import { describe, expect, it } from 'vitest'

import { labelOf, RISK_LEVELS, RiskLevel } from './levels.ts'

describe('risk levels', () => {
  it('should list the four levels from low to critical', () => {
    expect(RISK_LEVELS).toEqual(['low', 'medium', 'high', 'critical'])
  })

  it('should name the label of a level', () => {
    expect(labelOf(RiskLevel.High)).toBe('risk:high')
  })
})
