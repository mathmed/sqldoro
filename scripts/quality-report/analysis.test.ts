import { describe, expect, it } from 'vitest'

import { Analysis, isAnalysis } from './analysis.ts'

describe('isAnalysis', () => {
  it('should accept every analysis of the report', () => {
    expect(Object.values(Analysis).every(isAnalysis)).toBe(true)
  })

  it('should reject an unknown analysis', () => {
    expect(isAnalysis('ruff')).toBe(false)
  })
})
