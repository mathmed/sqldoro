import { describe, expect, it } from 'vitest'

import { footerFromEnvironment, runUrl } from './footer.ts'

const GITHUB = { GITHUB_REPOSITORY: 'mathmed/sqldoro', GITHUB_RUN_ID: '42' }
const NOW = new Date('2026-11-17T18:02:41.000Z')

describe('footerFromEnvironment', () => {
  it('should only give the time, in UTC, outside GitHub Actions', () => {
    expect(footerFromEnvironment({}, NOW)).toBe('2026-11-17 18:02 UTC')
    expect(footerFromEnvironment({ GITHUB_REPOSITORY: 'mathmed/sqldoro' }, NOW)).toBe(
      '2026-11-17 18:02 UTC',
    )
  })

  it('should link the run without a commit when none is known', () => {
    expect(footerFromEnvironment(GITHUB, NOW)).toBe(
      '2026-11-17 18:02 UTC · [CI run](https://github.com/mathmed/sqldoro/actions/runs/42)',
    )
  })

  it('should name the pull request head commit before the pushed commit', () => {
    const environment = {
      ...GITHUB,
      GITHUB_SERVER_URL: 'https://github.example.com',
      GITHUB_SHA: 'ffffffffffff',
      QUALITY_REPORT_SHA: 'abcdef0123456',
    }

    expect(footerFromEnvironment(environment, NOW)).toBe(
      'commit `abcdef0` · 2026-11-17 18:02 UTC · [CI run](https://github.example.com/mathmed/sqldoro/actions/runs/42)',
    )
  })

  it('should fall back to the pushed commit', () => {
    const environment = { ...GITHUB, GITHUB_SHA: '0123456789', QUALITY_REPORT_SHA: '' }

    expect(footerFromEnvironment(environment, NOW)).toContain('commit `0123456` · ')
  })
})

describe('runUrl', () => {
  it('should link a run of the repository', () => {
    expect(runUrl(GITHUB, '7')).toBe('https://github.com/mathmed/sqldoro/actions/runs/7')
  })

  it('should be empty without a run or a repository', () => {
    expect(runUrl(GITHUB, undefined)).toBe('')
    expect(runUrl(GITHUB, '')).toBe('')
    expect(runUrl({}, '7')).toBe('')
  })
})
