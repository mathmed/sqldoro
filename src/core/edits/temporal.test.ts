import { describe, expect, it } from 'vitest'

import { isDate, isTime, isTimestamp } from './temporal.ts'

const MYSQL_YEARS = { minYear: 1000, maxYear: 9999 }
const POSTGRES_YEARS = { minYear: 1, maxYear: 9999 }
const POSTGRES_TIME = { fraction: 6, maxHour: 23, hasTimeZone: false }
const POSTGRES_TIMETZ = { ...POSTGRES_TIME, hasTimeZone: true }
const MYSQL_TIME = { fraction: 0, maxHour: 838, hasTimeZone: false }

describe('isDate', () => {
  it.each([
    '2026-02-28',
    '2024-02-29',
    '2000-02-29',
    '1000-01-01',
    '9999-12-31',
    '2026-04-30',
    '2026-12-31',
    '2026-01-31',
  ])('should take %s', (text) => {
    expect(isDate(text, MYSQL_YEARS)).toBe(true)
  })

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2100-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-01-32',
    '2026-04-31',
    '0999-12-31',
    '26-01-01',
    '2026-1-1',
    '2026/01/01',
    ' 2026-01-01',
    '2026-01-01 ',
    '2026-01-01x',
    'x2026-01-01',
    '',
  ])('should refuse %s', (text) => {
    expect(isDate(text, MYSQL_YEARS)).toBe(false)
  })

  it('should keep to the years of the column', () => {
    expect(isDate('0001-01-01', POSTGRES_YEARS)).toBe(true)
    expect(isDate('0000-12-31', POSTGRES_YEARS)).toBe(false)
    expect(isDate('9999-12-31', { minYear: 1970, maxYear: 2038 })).toBe(false)
    expect(isDate('2038-12-31', { minYear: 1970, maxYear: 2038 })).toBe(true)
    expect(isDate('1970-01-01', { minYear: 1970, maxYear: 2038 })).toBe(true)
    expect(isDate('1969-12-31', { minYear: 1970, maxYear: 2038 })).toBe(false)
  })

  it('should know the leap days of the first centuries', () => {
    expect(isDate('0004-02-29', POSTGRES_YEARS)).toBe(true)
    expect(isDate('0100-02-29', POSTGRES_YEARS)).toBe(false)
    expect(isDate('0400-02-29', POSTGRES_YEARS)).toBe(true)
  })
})

describe('isTime', () => {
  it.each(['00:00:00', '23:59:59', '12:30:00.123456', '12:30:00.1', '09:05:07'])(
    'should take %s for a time column',
    (text) => {
      expect(isTime(text, POSTGRES_TIME)).toBe(true)
    },
  )

  it.each([
    '24:00:00',
    '12:60:00',
    '12:00:60',
    '12:00:00.1234567',
    '12:00',
    '12:00:00:00',
    '12:00:00.',
    '12:00:00.5.5',
    '12:00:00.x',
    '12:00:00.x5',
    '12:00:00.5x',
    '023:00:00',
    '1:00:00',
    '123:00:00',
    '12:0:00',
    '12:00:0',
    'ab:cd:ef',
    '12:00:00+02',
    '12:00:00 ',
    '',
  ])('should refuse %s for a time column', (text) => {
    expect(isTime(text, POSTGRES_TIME)).toBe(false)
  })

  it.each(['12:00:00+02', '12:00:00-03:30', '12:00:00+05:30:15', '12:00:00.5+15', '23:59:59-00'])(
    'should take %s, with its offset, for a time column with a time zone',
    (text) => {
      expect(isTime(text, POSTGRES_TIMETZ)).toBe(true)
    },
  )

  it.each([
    '12:00:00',
    '12:00:00+16',
    '12:00:00+1',
    '12:00:00+002',
    '12:00:00+02:60',
    '12:00:00+02:00:60',
    '12:00:00+02:00:00:00',
    '12:00:00+02:3',
    '12:00:00+',
    '12:00:00Z',
  ])('should refuse %s for a time column with a time zone', (text) => {
    expect(isTime(text, POSTGRES_TIMETZ)).toBe(false)
  })

  it('should take durations up to the largest hour of the column, without a fraction', () => {
    expect(isTime('838:59:59', MYSQL_TIME)).toBe(true)
    expect(isTime('100:00:00', MYSQL_TIME)).toBe(true)
    expect(isTime('00:00:00', MYSQL_TIME)).toBe(true)
    expect(isTime('839:00:00', MYSQL_TIME)).toBe(false)
    expect(isTime('1000:00:00', MYSQL_TIME)).toBe(false)
    expect(isTime('12:00:00.1', MYSQL_TIME)).toBe(false)
    expect(isTime('-01:00:00', MYSQL_TIME)).toBe(false)
    expect(isTime(' 12:00:00', MYSQL_TIME)).toBe(false)
    expect(isTime('12 :00:00', MYSQL_TIME)).toBe(false)
  })

  it('should take as many fraction digits as the column keeps, no more', () => {
    expect(isTime('12:00:00.123', { ...POSTGRES_TIME, fraction: 3 })).toBe(true)
    expect(isTime('12:00:00.1234', { ...POSTGRES_TIME, fraction: 3 })).toBe(false)
  })
})

describe('isTimestamp', () => {
  const DATETIME = { fraction: 3, hasTimeZone: false, ...MYSQL_YEARS }
  const TIMESTAMPTZ = { fraction: 6, hasTimeZone: true, ...POSTGRES_YEARS }

  it.each([
    ['2026-01-02 03:04:05.678', DATETIME],
    ['2026-01-02 23:59:59', DATETIME],
    ['2026-01-02 01:04:05.678+00', TIMESTAMPTZ],
    ['0001-01-01 00:00:00-03:30', TIMESTAMPTZ],
  ])('should take %s', (text, spec) => {
    expect(isTimestamp(text, spec)).toBe(true)
  })

  it.each([
    ['2026-01-02T03:04:05', DATETIME],
    ['2026-01-02  03:04:05', DATETIME],
    ['2026-01-02 24:00:00', DATETIME],
    ['2026-01-02 100:00:00', DATETIME],
    ['2026-01-02 03:04:05.6789', DATETIME],
    ['2026-02-30 03:04:05', DATETIME],
    ['0999-01-02 03:04:05', DATETIME],
    ['2026-01-02', DATETIME],
    ['2026-01-02 01:04:05', TIMESTAMPTZ],
    ['2026-01-02 01:04:05+02', DATETIME],
  ])('should refuse %s', (text, spec) => {
    expect(isTimestamp(text, spec)).toBe(false)
  })
})
