import { describe, expect, it } from 'vitest'

import {
  databaseStatsDetails,
  databaseStatsSummary,
  objectCount,
  tableStatsDetails,
  tableStatsSummary,
} from './catalog-text.ts'

const ORDERS = { estimatedRows: 27_412n, sizeBytes: 33_554_432n }

describe('tableStatsSummary', () => {
  it('should show the estimated rows and the size, short', () => {
    expect(tableStatsSummary(ORDERS)).toBe('~27k rows · 32 MB')
  })

  it.each([
    { stats: { estimatedRows: 1n, sizeBytes: 8192n }, text: '~1 row · 8 KB' },
    { stats: { estimatedRows: 0n, sizeBytes: 0n }, text: '~0 rows · 0 B' },
    { stats: { estimatedRows: 999n, sizeBytes: undefined }, text: '~999 rows' },
    { stats: { estimatedRows: undefined, sizeBytes: 2_147_483_648n }, text: '2 GB' },
    { stats: { estimatedRows: undefined, sizeBytes: undefined }, text: '' },
    { stats: undefined, text: '' },
  ])('should show "$text"', ({ stats, text }) => {
    expect(tableStatsSummary(stats)).toBe(text)
  })
})

describe('tableStatsDetails', () => {
  it('should give the exact numbers and say they are estimates', () => {
    expect(tableStatsDetails(ORDERS)).toStrictEqual([
      'Rows: ~27,412',
      'Size: 32 MB (33,554,432 bytes)',
      'Estimates from the catalog statistics',
    ])
  })

  it('should leave out what the server does not know', () => {
    expect(tableStatsDetails({ estimatedRows: 1n, sizeBytes: undefined })).toStrictEqual([
      'Rows: ~1',
      'Estimates from the catalog statistics',
    ])
    expect(tableStatsDetails({ estimatedRows: undefined, sizeBytes: 1n })).toStrictEqual([
      'Size: 1 B (1 byte)',
      'Estimates from the catalog statistics',
    ])
  })

  it('should add nothing without statistics', () => {
    expect(tableStatsDetails({ estimatedRows: undefined, sizeBytes: undefined })).toStrictEqual([])
    expect(tableStatsDetails(undefined)).toStrictEqual([])
  })
})

describe('the size of a database', () => {
  it('should show it short beside the database and exact in its tooltip', () => {
    const stats = { sizeBytes: 983_040n }

    expect(databaseStatsSummary(stats)).toBe('960 KB')
    expect(databaseStatsDetails(stats)).toStrictEqual(['Size: 960 KB (983,040 bytes)'])
  })

  it.each([{ stats: { sizeBytes: undefined } }, { stats: undefined }])(
    'should show nothing without a size',
    ({ stats }) => {
      expect(databaseStatsSummary(stats)).toBe('')
      expect(databaseStatsDetails(stats)).toStrictEqual([])
    },
  )
})

describe('objectCount', () => {
  it('should count the objects of a group', () => {
    expect(objectCount(142, 142)).toBe('142')
    expect(objectCount(0, 0)).toBe('0')
    expect(objectCount(1234, 1234)).toBe('1,234')
  })

  it('should say how many of them the filter shows', () => {
    expect(objectCount(3, 142)).toBe('3 of 142')
    expect(objectCount(0, 1500)).toBe('0 of 1,500')
  })
})
