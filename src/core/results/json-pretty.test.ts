import { describe, expect, it, vi } from 'vitest'

import { prettyJson } from './json-pretty.ts'

describe('prettyJson', () => {
  it('should indent objects and arrays keeping every digit of the numbers', () => {
    expect(
      prettyJson(' {"a": 12345678901234567890.10, "b": [1e400, -0.0, true, null, "x"]} '),
    ).toBe(
      [
        '{',
        '  "a": 12345678901234567890.10,',
        '  "b": [',
        '    1e400,',
        '    -0.0,',
        '    true,',
        '    null,',
        '    "x"',
        '  ]',
        '}',
      ].join('\n'),
    )
    expect(prettyJson('[]')).toBe('[]')
  })

  it('should not read scalars, plain text or broken JSON', () => {
    expect(prettyJson('42')).toBeUndefined()
    expect(prettyJson('"text"')).toBeUndefined()
    expect(prettyJson('hello')).toBeUndefined()
    expect(prettyJson('{"a": ')).toBeUndefined()
    expect(prettyJson('')).toBeUndefined()
  })
  it('should rethrow what is not a JSON syntax error', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new RangeError('too deep')
    })

    expect(() => prettyJson('[1]')).toThrow(RangeError)
  })
})
