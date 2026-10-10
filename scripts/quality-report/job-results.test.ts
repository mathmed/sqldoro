import { describe, expect, it } from 'vitest'

import { parseJobResults } from './job-results.ts'

describe('parseJobResults', () => {
  it('should read the result of each job from the needs context', () => {
    const needs = JSON.stringify({
      lint: { result: 'success', outputs: {} },
      smoke: { result: 'failure', outputs: {} },
      mutation: { outputs: {} },
    })

    expect([...parseJobResults(needs)]).toEqual([
      ['lint', 'success'],
      ['smoke', 'failure'],
      ['mutation', 'unknown'],
    ])
  })

  it('should know no job outside CI', () => {
    expect(parseJobResults('').size).toBe(0)
  })
})
