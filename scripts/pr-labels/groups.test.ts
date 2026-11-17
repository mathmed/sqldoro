import { describe, expect, it } from 'vitest'

import { DEPLOY_LABELS, LABEL_GROUPS, labelsOf, RISK_LABELS } from './groups.ts'

describe('label groups', () => {
  it('should list the four risk levels from low to critical', () => {
    expect(labelsOf(RISK_LABELS)).toEqual(['risk:low', 'risk:medium', 'risk:high', 'risk:critical'])
  })

  it('should list the four deploy kinds from none to coordinated', () => {
    expect(labelsOf(DEPLOY_LABELS)).toEqual([
      'deploy:none',
      'deploy:simple',
      'deploy:migration',
      'deploy:coordinated',
    ])
  })

  it('should check the risk group first, then the deploy group', () => {
    expect(LABEL_GROUPS).toEqual([RISK_LABELS, DEPLOY_LABELS])
  })
})
