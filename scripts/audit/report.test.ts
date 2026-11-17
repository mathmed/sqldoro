import { describe, expect, it } from 'vitest'

import { readAdvisories } from './report.ts'

const PICOMATCH = {
  source: 1_247_710,
  name: 'picomatch',
  dependency: 'picomatch',
  title: 'picomatch vulnerable to ReDoS through single-branch repeated extglobs',
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  severity: 'high',
  range: '<=4.0.7',
}

function report(vulnerabilities: Record<string, unknown>): string {
  return JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: {} })
}

describe('readAdvisories', () => {
  it('should read every advisory once, leaving out the packages only vulnerable through another', () => {
    const json = report({
      picomatch: { name: 'picomatch', via: [PICOMATCH] },
      tinyglobby: { name: 'tinyglobby', via: ['picomatch', PICOMATCH] },
      vite: { name: 'vite', via: ['picomatch', 'tinyglobby'] },
    })

    expect(readAdvisories(json)).toStrictEqual([
      {
        id: 'GHSA-fc5q-39xc-vjpf',
        packageName: 'picomatch',
        range: '<=4.0.7',
        severity: 'high',
        title: PICOMATCH.title,
        url: PICOMATCH.url,
      },
    ])
  })

  it('should keep the same advisory reported for two ranges apart', () => {
    const json = report({
      picomatch: { via: [PICOMATCH, { ...PICOMATCH, range: '2.0.0 - 2.3.1' }] },
    })

    expect(readAdvisories(json).map(({ range }) => range)).toStrictEqual([
      '<=4.0.7',
      '2.0.0 - 2.3.1',
    ])
  })

  it('should name an advisory by its url when it has no GHSA id', () => {
    const url = 'https://example.com/advisories/1234'
    const json = report({ left: { via: [{ ...PICOMATCH, url }] } })

    expect(readAdvisories(json)[0]?.id).toBe(url)
  })

  it('should read an empty report', () => {
    expect(readAdvisories(report({}))).toStrictEqual([])
  })

  it('should fail when npm could not audit', () => {
    const json = JSON.stringify({ error: { code: 'ENOAUDIT', summary: 'audit endpoint down' } })

    expect(() => readAdvisories(json)).toThrow('npm audit could not audit: audit endpoint down')
  })

  it('should fail on a report format it does not know', () => {
    const json = JSON.stringify({ auditReportVersion: 1, advisories: {} })

    expect(() => readAdvisories(json)).toThrow('unknown npm audit report version (expected 2)')
  })

  it('should fail on an advisory it cannot read', () => {
    const json = report({ picomatch: { via: [{ ...PICOMATCH, range: 4 }] } })

    expect(() => readAdvisories(json)).toThrow('expected "range" to be a string')
  })

  it('should fail on output that is not JSON', () => {
    expect(() => readAdvisories('')).toThrow(SyntaxError)
  })
})
