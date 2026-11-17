import { describe, expect, it } from 'vitest'

import type { Metric } from './finding.ts'
import { renderMetric } from './metric.ts'

const COVERAGE: Metric = { label: 'coverage', value: 100, unit: '%', decimals: 2 }

describe('renderMetric', () => {
  it('should say n/a without a base to compare with', () => {
    expect(renderMetric(COVERAGE, undefined)).toBe('coverage 100.00% (n/a)')
  })

  it('should say = when the value did not move at its precision', () => {
    expect(renderMetric(COVERAGE, { ...COVERAGE, value: 100.001 })).toBe('coverage 100.00% (=)')
  })

  it('should show how much the value went up or down', () => {
    const score: Metric = { label: 'score', value: 91.2, unit: '%', decimals: 1 }

    expect(renderMetric(score, { ...score, value: 93.3 })).toBe('score 91.2% (↓2.1)')
    expect(renderMetric(score, { ...score, value: 90 })).toBe('score 91.2% (↑1.2)')
  })

  it('should count without a unit or decimals', () => {
    const total: Metric = { label: 'total', value: 9, unit: '', decimals: 0 }

    expect(renderMetric(total, { ...total, value: 10 })).toBe('total 9 (↓1)')
  })
})
