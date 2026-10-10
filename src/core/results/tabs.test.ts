import { describe, expect, it } from 'vitest'

import { formatDuration, groupDigits, plural, summaryText, tabTitle } from './tabs.ts'

describe('tabTitle', () => {
  it('should put the statement on one line', () => {
    expect(tabTitle('  SELECT *\n\tFROM   t  ')).toBe('SELECT * FROM t')
  })

  it('should cut long statements with an ellipsis', () => {
    const title = tabTitle(`SELECT ${'x'.repeat(100)}`)

    expect(title).toHaveLength(60)
    expect(title.endsWith('…')).toBe(true)
    expect(tabTitle('y'.repeat(60))).toBe('y'.repeat(60))
  })
})

describe('groupDigits', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [1_234_567, '1,234,567'],
    [100_000, '100,000'],
  ])('should write %d as %s', (count, text) => {
    expect(groupDigits(count)).toBe(text)
  })
})

describe('plural', () => {
  it('should pick the form by the count', () => {
    expect(plural(1, 'row', 'rows')).toBe('1 row')
    expect(plural(0, 'row', 'rows')).toBe('0 rows')
    expect(plural(2000, 'row', 'rows')).toBe('2,000 rows')
  })
})

describe('formatDuration', () => {
  it('should show milliseconds under a second and seconds from there', () => {
    expect(formatDuration(12.4)).toBe('12 ms')
    expect(formatDuration(999.4)).toBe('999 ms')
    expect(formatDuration(1000)).toBe('1.00 s')
    expect(formatDuration(65_432)).toBe('65.43 s')
  })
})

describe('summaryText', () => {
  it('should say how many rows came back and how long it took', () => {
    expect(summaryText({ durationMs: 35, affectedRows: null, isTruncated: false }, 1234)).toBe(
      '1,234 rows in 35 ms',
    )
  })

  it('should say how many rows a statement changed', () => {
    expect(summaryText({ durationMs: 2000, affectedRows: 1, isTruncated: false }, 0)).toBe(
      '1 row affected in 2.00 s',
    )
    expect(summaryText({ durationMs: 1, affectedRows: 3, isTruncated: false }, 0)).toBe(
      '3 rows affected in 1 ms',
    )
  })

  it('should say when the row limit cut the result', () => {
    expect(summaryText({ durationMs: 5, affectedRows: null, isTruncated: true }, 1)).toBe(
      '1 row (row limit reached) in 5 ms',
    )
  })
})
