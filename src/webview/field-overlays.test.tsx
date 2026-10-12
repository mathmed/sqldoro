import { beforeEach, describe, expect, it } from 'vitest'

import { openTable, part, toggleWithKeys } from '../../test/webview/query-box.ts'
import { loadStylesheets } from '../../test/webview/stylesheets.ts'

// What places the glyphs of a line: the caret comes from the transparent field and the glyphs from
// its colored copy, so both must agree on each of these or the caret drifts from the text. (jsdom
// does not expand a border shorthand written with var(), so the borders cannot be compared here.)
const TEXT_METRICS: readonly string[] = [
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'letter-spacing',
  'box-sizing',
  'padding-left',
  'padding-top',
]

function metrics(element: Element): Map<string, string> {
  const style = getComputedStyle(element)
  return new Map(TEXT_METRICS.map((name) => [name, style.getPropertyValue(name)]))
}

describe('a field drawn over its colored copy', () => {
  beforeEach(loadStylesheets)

  it('should give the WHERE of a table the font of its copy, the grid font', () => {
    openTable()

    const sut = metrics(part('.where-input'))

    expect(sut).toStrictEqual(metrics(part('.where-highlight')))
    expect(sut.get('font-family')).toBe('var(--grid-font)')
  })

  it('should give the query box the font of its copy, the grid font', () => {
    openTable()
    toggleWithKeys()

    const sut = metrics(part('.query-input'))

    expect(sut).toStrictEqual(metrics(part('.query-highlight')))
    expect(sut.get('font-family')).toBe('var(--grid-font)')
  })
})
