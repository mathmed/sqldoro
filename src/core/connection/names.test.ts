import { describe, expect, it } from 'vitest'

import { nameKey, nameKeys, uniqueName } from './names.ts'

describe('nameKey', () => {
  it('should ignore case and surrounding spaces', () => {
    expect(nameKey('  Prod DB ')).toBe('prod db')
  })
})

describe('nameKeys', () => {
  it('should collect the key of every name', () => {
    expect(nameKeys(['Shop', ' shop ', 'Billing'])).toStrictEqual(new Set(['shop', 'billing']))
  })
})

describe('uniqueName', () => {
  it('should keep a name nobody uses, without surrounding spaces', () => {
    expect(uniqueName(' Shop ', new Set(['billing']))).toBe('Shop')
  })

  it('should number a taken name from 2', () => {
    expect(uniqueName('Shop', new Set(['shop']))).toBe('Shop (2)')
  })

  it('should skip every number already taken', () => {
    expect(uniqueName('Shop', new Set(['shop', 'shop (2)', 'shop (3)']))).toBe('Shop (4)')
  })
})
