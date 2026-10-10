import { describe, expect, it } from 'vitest'

import { footerFromEnvironment } from './footer.ts'

const GITHUB = { GITHUB_REPOSITORY: 'mathmed/sqldoro', GITHUB_RUN_ID: '42' }

describe('footerFromEnvironment', () => {
  it('should be empty outside GitHub Actions', () => {
    expect(footerFromEnvironment({})).toBe('')
    expect(footerFromEnvironment({ GITHUB_REPOSITORY: 'mathmed/sqldoro' })).toBe('')
    expect(footerFromEnvironment({ ...GITHUB, GITHUB_RUN_ID: '' })).toBe('')
  })

  it('should link the run without a commit when none is known', () => {
    expect(footerFromEnvironment(GITHUB)).toBe(
      '[CI run](https://github.com/mathmed/sqldoro/actions/runs/42)',
    )
  })

  it('should name the pull request head commit before the pushed commit', () => {
    const environment = {
      ...GITHUB,
      GITHUB_SERVER_URL: 'https://github.example.com',
      GITHUB_SHA: 'ffffffffffff',
      QUALITY_REPORT_SHA: 'abcdef0123456',
    }

    expect(footerFromEnvironment(environment)).toBe(
      'commit `abcdef0` · [CI run](https://github.example.com/mathmed/sqldoro/actions/runs/42)',
    )
  })

  it('should fall back to the pushed commit', () => {
    const environment = { ...GITHUB, GITHUB_SHA: '0123456789', QUALITY_REPORT_SHA: '' }

    expect(footerFromEnvironment(environment)).toBe(
      'commit `0123456` · [CI run](https://github.com/mathmed/sqldoro/actions/runs/42)',
    )
  })
})
