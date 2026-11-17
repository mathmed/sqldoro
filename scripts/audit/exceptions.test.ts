import { describe, expect, it } from 'vitest'

import { evaluateAudit } from './evaluate.ts'
import { AUDIT_EXCEPTIONS } from './exceptions.ts'

describe('AUDIT_EXCEPTIONS', () => {
  it('should only hold exceptions that are valid on the day they were created', () => {
    for (const exception of AUDIT_EXCEPTIONS) {
      const advisory = {
        id: exception.id,
        packageName: exception.packageName,
        range: exception.range,
        severity: 'high',
        title: 'advisory',
        url: `https://github.com/advisories/${exception.id}`,
      }

      const sut = evaluateAudit([advisory], [exception], exception.created)

      expect(sut.problems).toStrictEqual([])
    }
  })
})
