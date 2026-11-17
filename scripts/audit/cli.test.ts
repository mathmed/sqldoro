import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { type AuditContext, main } from './cli.ts'
import type { AuditException } from './exceptions.ts'

const PICOMATCH = {
  name: 'picomatch',
  title: 'picomatch vulnerable to ReDoS',
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  severity: 'high',
  range: '<=4.0.7',
}
const QS = {
  name: 'qs',
  title: 'qs has a remotely triggerable DoS',
  url: 'https://github.com/advisories/GHSA-q8mj-m7cp-5q26',
  severity: 'moderate',
  range: '2.2.5 - 6.15.3',
}
const EXCEPTION: AuditException = {
  id: 'GHSA-fc5q-39xc-vjpf',
  packageName: 'picomatch',
  range: '<=4.0.7',
  created: '2026-11-17',
  expires: '2026-12-17',
}

function report(...advisories: readonly object[]): string {
  const vulnerabilities = Object.fromEntries(
    advisories.map((advisory) => [String(Reflect.get(advisory, 'name')), { via: [advisory] }]),
  )
  return JSON.stringify({ auditReportVersion: 2, vulnerabilities })
}

function context(output: string, today = '2026-11-17'): AuditContext {
  return { runAudit: async () => Promise.resolve(output), exceptions: [EXCEPTION], today }
}

function printed(spy: MockInstance<typeof console.log>): string {
  return spy.mock.calls.map(([text]) => String(text)).join('\n')
}

describe('audit command line', () => {
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('should pass and list the advisory a temporary exception accepts', async () => {
    expect(await main(['check'], context(report(PICOMATCH)))).toBe(0)
    expect(printed(log)).toBe(
      [
        'Accepted by a temporary exception: GHSA-fc5q-39xc-vjpf picomatch <=4.0.7, high: ' +
          'picomatch vulnerable to ReDoS (https://github.com/advisories/GHSA-fc5q-39xc-vjpf)',
        '0 audit problems, 1 vulnerability accepted by a temporary exception.',
      ].join('\n'),
    )
  })

  it('should fail on any other advisory, even with the exception in place', async () => {
    expect(await main(['check'], context(report(PICOMATCH, QS)))).toBe(1)
    expect(printed(log)).toContain('Not accepted: GHSA-q8mj-m7cp-5q26 qs 2.2.5 - 6.15.3, moderate')
    expect(printed(log)).toContain(
      '1 audit problem, 1 vulnerability accepted by a temporary exception.',
    )
  })

  it('should fail once the exception expired', async () => {
    expect(await main(['check'], context(report(PICOMATCH), '2026-12-18'))).toBe(1)
    expect(printed(log)).toContain(
      '1 audit problem, 0 vulnerabilities accepted by a temporary exception.',
    )
  })

  it('should fail when npm could not audit', async () => {
    const output = JSON.stringify({ error: { summary: 'network down' } })

    await expect(main(['check'], context(output))).rejects.toThrow('network down')
  })

  it.each([[[]], [['fix']], [['check', '--force']]])(
    'should refuse the arguments %j',
    async (argv) => {
      expect(await main(argv, context(report()))).toBe(2)
      expect(error).toHaveBeenCalledWith(expect.stringContaining('usage:'))
    },
  )
})
