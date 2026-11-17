import { describe, expect, it } from 'vitest'

import { evaluateAudit, MAX_EXCEPTION_DAYS } from './evaluate.ts'
import type { AuditException } from './exceptions.ts'
import type { Advisory } from './report.ts'

const PICOMATCH: Advisory = {
  id: 'GHSA-fc5q-39xc-vjpf',
  packageName: 'picomatch',
  range: '<=4.0.7',
  severity: 'high',
  title: 'picomatch vulnerable to ReDoS',
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
}
const OTHER: Advisory = {
  id: 'GHSA-q8mj-m7cp-5q26',
  packageName: 'qs',
  range: '2.2.5 - 6.15.3',
  severity: 'moderate',
  title: 'qs has a remotely triggerable DoS',
  url: 'https://github.com/advisories/GHSA-q8mj-m7cp-5q26',
}
const EXCEPTION: AuditException = {
  id: 'GHSA-fc5q-39xc-vjpf',
  packageName: 'picomatch',
  range: '<=4.0.7',
  created: '2026-11-17',
  expires: '2026-12-17',
}
const PICOMATCH_TEXT =
  'GHSA-fc5q-39xc-vjpf picomatch <=4.0.7, high: picomatch vulnerable to ReDoS ' +
  '(https://github.com/advisories/GHSA-fc5q-39xc-vjpf)'
const TODAY = '2026-11-17'

describe('evaluateAudit', () => {
  it('should pass a clean audit', () => {
    expect(evaluateAudit([], [], TODAY)).toStrictEqual({ accepted: [], problems: [] })
  })

  it('should accept the advisory of an exception until the day it expires, included', () => {
    const sut = evaluateAudit([PICOMATCH], [EXCEPTION], EXCEPTION.expires)

    expect(sut).toStrictEqual({ accepted: [PICOMATCH], problems: [] })
  })

  it('should refuse every advisory no exception covers', () => {
    const sut = evaluateAudit([PICOMATCH, OTHER], [EXCEPTION], TODAY)

    expect(sut.accepted).toStrictEqual([PICOMATCH])
    expect(sut.problems).toStrictEqual([
      'Not accepted: GHSA-q8mj-m7cp-5q26 qs 2.2.5 - 6.15.3, moderate: qs has a remotely ' +
        'triggerable DoS (https://github.com/advisories/GHSA-q8mj-m7cp-5q26)',
    ])
  })

  it('should refuse the same advisory id in another package', () => {
    const sut = evaluateAudit([{ ...PICOMATCH, packageName: 'micromatch' }], [EXCEPTION], TODAY)

    expect(sut.accepted).toStrictEqual([])
    expect(sut.problems[0]).toMatch(/^Not accepted: GHSA-fc5q-39xc-vjpf micromatch/u)
    expect(sut.problems[1]).toMatch(/^Stale exception: GHSA-fc5q-39xc-vjpf \(picomatch\)/u)
  })

  it('should refuse the advisory from the day after the exception expires', () => {
    const sut = evaluateAudit([PICOMATCH], [EXCEPTION], '2026-12-18')

    expect(sut).toStrictEqual({
      accepted: [],
      problems: [`Expired on 2026-12-17: the exception for ${PICOMATCH_TEXT}`],
    })
  })

  it('should refuse the advisory once its range changes, as when a fixed release is out', () => {
    const sut = evaluateAudit([{ ...PICOMATCH, range: '<4.0.8' }], [EXCEPTION], TODAY)

    expect(sut.accepted).toStrictEqual([])
    expect(sut.problems).toStrictEqual([
      'Changed: GHSA-fc5q-39xc-vjpf picomatch <4.0.8, high: picomatch vulnerable to ReDoS ' +
        '(https://github.com/advisories/GHSA-fc5q-39xc-vjpf); the exception covers <=4.0.7. A fixed ' +
        'release may be out: upgrade picomatch and delete the exception from scripts/audit/exceptions.ts',
    ])
  })

  it('should fail on an exception whose advisory is no longer reported', () => {
    expect(evaluateAudit([], [EXCEPTION], TODAY)).toStrictEqual({
      accepted: [],
      problems: [
        'Stale exception: GHSA-fc5q-39xc-vjpf (picomatch) is no longer reported; delete it from ' +
          'scripts/audit/exceptions.ts',
      ],
    })
  })

  it(`should accept an exception of exactly ${String(MAX_EXCEPTION_DAYS)} days`, () => {
    const exception = { ...EXCEPTION, created: '2026-01-01', expires: '2026-01-31' }

    expect(evaluateAudit([PICOMATCH], [exception], '2026-01-01').problems).toStrictEqual([])
  })

  it.each([
    {
      kind: 'longer than the limit',
      created: '2026-11-17',
      expires: '2026-12-18',
      reason: 'it lasts 31 days; an exception lasts 1 to 30 days',
    },
    {
      kind: 'that ends the day it starts',
      created: '2026-11-17',
      expires: '2026-11-17',
      reason: 'it lasts 0 days; an exception lasts 1 to 30 days',
    },
    {
      kind: 'that ends before it starts',
      created: '2026-11-17',
      expires: '2026-11-16',
      reason: 'it lasts -1 days; an exception lasts 1 to 30 days',
    },
    {
      kind: 'with a date that is not YYYY-MM-DD',
      created: '17/11/2026',
      expires: '2026-12-17',
      reason: 'its dates must be YYYY-MM-DD (created 17/11/2026, expires 2026-12-17)',
    },
    {
      kind: 'with an expiry that is not YYYY-MM-DD',
      created: '2026-11-17',
      expires: 'next month',
      reason: 'its dates must be YYYY-MM-DD (created 2026-11-17, expires next month)',
    },
  ])(
    'should refuse an exception $kind and the advisory it covers',
    ({ created, expires, reason }) => {
      const sut = evaluateAudit([PICOMATCH], [{ ...EXCEPTION, created, expires }], TODAY)

      expect(sut).toStrictEqual({
        accepted: [],
        problems: [
          `Not accepted: ${PICOMATCH_TEXT}`,
          `Invalid exception GHSA-fc5q-39xc-vjpf: ${reason}`,
        ],
      })
    },
  )
})
