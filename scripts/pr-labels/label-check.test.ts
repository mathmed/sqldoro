import { describe, expect, it } from 'vitest'

import { labelProblems, parseLabels, PrLabelError } from './label-check.ts'

const RISKS = 'risk:low, risk:medium, risk:high, risk:critical'
const DEPLOYS = 'deploy:none, deploy:simple, deploy:migration, deploy:coordinated'

describe('parseLabels', () => {
  it('should read the labels given as a JSON list of names', () => {
    expect(parseLabels('["bug","risk:high"]')).toEqual(['bug', 'risk:high'])
    expect(parseLabels('[]')).toEqual([])
    expect(parseLabels('')).toEqual([])
  })

  it.each(['{}', '[1]', '"risk:high"', 'null'])('should reject %s', (json) => {
    expect(() => parseLabels(json)).toThrow(PrLabelError)
    expect(() => parseLabels(json)).toThrow(
      `--labels-json must be a JSON list of strings, got: ${json}`,
    )
  })
})

describe('labelProblems', () => {
  it.each(['risk:low', 'risk:medium', 'risk:high', 'risk:critical'])(
    'should accept %s with a deploy label, whatever the other labels',
    (label) => {
      expect(labelProblems(['bug', label, 'deploy:none'])).toEqual([])
    },
  )

  it.each(['deploy:none', 'deploy:simple', 'deploy:migration', 'deploy:coordinated'])(
    'should accept %s with a risk label',
    (label) => {
      expect(labelProblems(['risk:low', label])).toEqual([])
    },
  )

  it('should require both labels, and say what each group misses', () => {
    expect(labelProblems(['bug'])).toEqual([
      `expected exactly one risk label (${RISKS}), found: none`,
      `expected exactly one deploy label (${DEPLOYS}), found: none`,
    ])
  })

  it('should refuse more than one label of a group', () => {
    expect(labelProblems(['risk:low', 'risk:high', 'deploy:none'])).toEqual([
      `expected exactly one risk label (${RISKS}), found: risk:low, risk:high`,
    ])
    expect(labelProblems(['risk:low', 'deploy:none', 'deploy:simple'])).toEqual([
      `expected exactly one deploy label (${DEPLOYS}), found: deploy:none, deploy:simple`,
    ])
  })

  it('should refuse an unknown label of a group', () => {
    expect(labelProblems(['risk:severe', 'deploy:later'])).toEqual([
      `unknown risk label risk:severe: use one of ${RISKS}`,
      `unknown deploy label deploy:later: use one of ${DEPLOYS}`,
    ])
  })
})
