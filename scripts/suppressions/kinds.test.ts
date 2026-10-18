import { describe, expect, it } from 'vitest'

import { isSuppressionKind, kindOrder, mayHoldSuppressions, SuppressionKind } from './kinds.ts'

describe('suppression kinds', () => {
  it('should recognise every kind and nothing else', () => {
    expect(Object.values(SuppressionKind).every(isSuppressionKind)).toBe(true)
    expect(isSuppressionKind('noqa')).toBe(false)
  })

  it('should order the kinds as they are declared', () => {
    expect(kindOrder(SuppressionKind.EslintDisable)).toBe(0)
    expect(kindOrder(SuppressionKind.TestFocus)).toBe(Object.values(SuppressionKind).length - 1)
  })

  it.each([
    '// ESLint-disable',
    '// @ts-expect-error',
    '/* c8 ignore next */',
    '// Stryker disable all',
    '/** @alias */',
    'it\n  .skip',
    'it?.only',
    'x.fails',
    'test.todo',
    'describe.runIf',
    'it.skipIf',
    'xdescribe',
    'fit',
  ])('should parse a file holding %j', (source) => {
    expect(mayHoldSuppressions(source)).toBe(true)
  })

  it.each(['only', 'it skips', 'Only. Only', 'fitting', 'a.skipping'])(
    'should not parse a file holding only %j',
    (source) => {
      expect(mayHoldSuppressions(source)).toBe(false)
    },
  )
})
