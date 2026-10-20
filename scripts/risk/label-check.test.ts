import { describe, expect, it } from 'vitest'

import { labelProblem, parseLabels, RiskLabelError } from './label-check.ts'

describe('parseLabels', () => {
  it('should read the labels given as a JSON list of names', () => {
    expect(parseLabels('["bug","risk:high"]')).toEqual(['bug', 'risk:high'])
    expect(parseLabels('[]')).toEqual([])
    expect(parseLabels('')).toEqual([])
  })

  it.each(['{}', '[1]', '"risk:high"', 'null'])('should reject %s', (json) => {
    expect(() => parseLabels(json)).toThrow(RiskLabelError)
    expect(() => parseLabels(json)).toThrow(
      `--labels-json must be a JSON list of strings, got: ${json}`,
    )
  })
})

describe('labelProblem', () => {
  it.each(['risk:low', 'risk:medium', 'risk:high', 'risk:critical'])(
    'should accept %s alone, whatever the other labels',
    (label) => {
      expect(labelProblem(['bug', label])).toBeUndefined()
    },
  )

  it('should require a risk label', () => {
    expect(labelProblem(['bug'])).toBe(
      'expected exactly one risk label (risk:low, risk:medium, risk:high, risk:critical), found: none',
    )
  })

  it('should refuse more than one risk label', () => {
    expect(labelProblem(['risk:low', 'risk:high'])).toBe(
      'expected exactly one risk label (risk:low, risk:medium, risk:high, risk:critical), found: risk:low, risk:high',
    )
  })

  it('should refuse an unknown risk label', () => {
    expect(labelProblem(['risk:severe'])).toBe(
      'unknown risk label risk:severe: use one of risk:low, risk:medium, risk:high, risk:critical',
    )
  })
})
