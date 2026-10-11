import { describe, expect, it } from 'vitest'

import { parseSearchHostMessage } from './parse-host-message.ts'
import { parseSearchViewMessage } from './parse-view-message.ts'

const STATUS = { text: 'ord', matchCount: 2, connectionCount: 1, isLoading: false }

describe('parseSearchViewMessage', () => {
  it('should read the messages without fields', () => {
    for (const type of ['ready', 'focused', 'openBest', 'focusTree']) {
      expect(parseSearchViewMessage({ type, extra: 1 })).toStrictEqual({ type })
    }
  })

  it('should read the text typed and the problems of the box', () => {
    expect(parseSearchViewMessage({ type: 'search', text: ' ord' })).toStrictEqual({
      type: 'search',
      text: ' ord',
    })
    expect(parseSearchViewMessage({ type: 'problem', message: 'bad' })).toStrictEqual({
      type: 'problem',
      message: 'bad',
    })
  })

  it('should name the field that is wrong', () => {
    expect(() => parseSearchViewMessage({ type: 'search', text: 7 })).toThrow(
      new TypeError('"text" must be a string'),
    )
    expect(() => parseSearchViewMessage({ type: 'problem' })).toThrow(
      new TypeError('"message" must be a string'),
    )
    expect(() => parseSearchViewMessage({ type: 'drop' })).toThrow(
      new TypeError('"type" must be a known value'),
    )
    expect(() => parseSearchViewMessage('ready')).toThrow(new TypeError('expected an object'))
  })
})

describe('parseSearchHostMessage', () => {
  it('should read where the search stands', () => {
    expect(parseSearchHostMessage({ type: 'status', status: STATUS })).toStrictEqual({
      type: 'status',
      status: STATUS,
    })
    expect(parseSearchHostMessage({ type: 'setText', text: '' })).toStrictEqual({
      type: 'setText',
      text: '',
    })
    expect(parseSearchHostMessage({ type: 'focus' })).toStrictEqual({ type: 'focus' })
  })

  it('should name the field that is wrong', () => {
    const status = (changes: object): unknown => ({
      type: 'status',
      status: { ...STATUS, ...changes },
    })

    expect(() => parseSearchHostMessage(status({ text: null }))).toThrow(
      new TypeError('"text" must be a string'),
    )
    expect(() => parseSearchHostMessage(status({ matchCount: -1 }))).toThrow(
      new TypeError('"matchCount" must be a whole number of 0 or more'),
    )
    expect(() => parseSearchHostMessage(status({ connectionCount: 1.5 }))).toThrow(
      new TypeError('"connectionCount" must be a whole number of 0 or more'),
    )
    expect(() => parseSearchHostMessage(status({ isLoading: 'no' }))).toThrow(
      new TypeError('"isLoading" must be a boolean'),
    )
    expect(() => parseSearchHostMessage({ type: 'status' })).toThrow(
      new TypeError('"status" must be an object'),
    )
    expect(() => parseSearchHostMessage({ type: 'setText' })).toThrow(
      new TypeError('"text" must be a string'),
    )
    expect(() => parseSearchHostMessage({ type: 'open' })).toThrow(
      new TypeError('"type" must be a known value'),
    )
  })
})
