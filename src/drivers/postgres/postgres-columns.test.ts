import { describe, expect, it } from 'vitest'

import { type PostgresColumn, tableColumnOf } from './postgres-columns.ts'

const PLAIN = { parameterType: '', comparedAs: '', collation: '' }
const AS_TEXT = { ...PLAIN, comparedAs: 'text' }
const YEARS = { minYear: 1, maxYear: 9999 }
// numeric(p,s) is stored as ((p << 16) | s) + 4.
const NUMERIC_10_2 = (10 << 16) + 2 + 4

function column(changes: Partial<PostgresColumn>): PostgresColumn {
  return {
    reference: '3',
    name: 'value',
    dataType: 'integer',
    typeName: 'int4',
    typeType: 'b',
    category: 'N',
    isNullable: false,
    hasDefault: false,
    identity: '',
    generated: '',
    modifier: -1,
    labels: [],
    ...changes,
  }
}

describe('tableColumnOf (PostgreSQL)', () => {
  it('should name the column by its number and keep its whole type', () => {
    expect(tableColumnOf(column({ name: 'Total', dataType: 'numeric(10,2)' }))).toMatchObject({
      name: 'Total',
      reference: '3',
      dataType: 'numeric(10,2)',
    })
  })

  it.each([
    ['int2', '-32768', '32767'],
    ['int4', '-2147483648', '2147483647'],
    ['int8', '-9223372036854775808', '9223372036854775807'],
  ])('should check %s values from %s to %s', (typeName, min, max) => {
    expect(tableColumnOf(column({ typeName }))).toMatchObject({
      value: { type: 'integer', min, max },
      sql: PLAIN,
    })
  })

  it('should read the precision and scale of numeric from its type modifier', () => {
    expect(tableColumnOf(column({ typeName: 'numeric', modifier: NUMERIC_10_2 }))).toMatchObject({
      value: { type: 'decimal', precision: 10, scale: 2 },
      sql: PLAIN,
    })
    expect(tableColumnOf(column({ typeName: 'numeric', modifier: (5 << 16) + 4 })).value).toEqual({
      type: 'decimal',
      precision: 5,
      scale: 0,
    })
    expect(tableColumnOf(column({ typeName: 'numeric' })).value).toStrictEqual({
      type: 'decimal',
      precision: 0,
      scale: 0,
    })
  })

  it.each([
    ['numeric(5,-2)', (5 << 16) + 0x7_fe + 4],
    ['numeric(3,5)', (3 << 16) + 5 + 4],
  ])(
    'should show %s values read-only: their scale is outside their precision',
    (dataType, modifier) => {
      expect(
        tableColumnOf(column({ typeName: 'numeric', dataType, modifier })).value,
      ).toStrictEqual({
        type: 'readOnly',
        reason: `sqldoro does not edit ${dataType} values: their scale is outside their precision.`,
      })
    },
  )

  it.each([
    ['float4', { type: 'float' }],
    ['float8', { type: 'float' }],
    ['bool', { type: 'boolean' }],
    ['text', { type: 'text', maxLength: 0 }],
    ['date', { type: 'date', ...YEARS }],
    ['uuid', { type: 'uuid' }],
    ['bytea', { type: 'readOnly', reason: 'Binary values are shown read-only.' }],
  ])('should check %s values', (typeName, value) => {
    expect(tableColumnOf(column({ typeName }))).toMatchObject({ value, sql: PLAIN })
  })

  it.each([
    ['varchar', 24, 20],
    ['bpchar', 5, 1],
    ['varchar', -1, 0],
    ['bpchar', 4, 0],
  ])(
    'should check the length of %s with modifier %i: at most %i',
    (typeName, modifier, maxLength) => {
      expect(tableColumnOf(column({ typeName, modifier })).value).toStrictEqual({
        type: 'text',
        maxLength,
      })
    },
  )

  it.each([
    ['time', -1, { type: 'time', fraction: 6, maxHour: 23, hasTimeZone: false }],
    ['timetz', 0, { type: 'time', fraction: 0, maxHour: 23, hasTimeZone: true }],
    ['timestamp', 3, { type: 'timestamp', fraction: 3, hasTimeZone: false, ...YEARS }],
    ['timestamptz', -1, { type: 'timestamp', fraction: 6, hasTimeZone: true, ...YEARS }],
  ])('should check %s values with modifier %i', (typeName, modifier, value) => {
    expect(tableColumnOf(column({ typeName, modifier }))).toMatchObject({ value, sql: PLAIN })
  })

  it.each(['json', 'jsonb'])('should compare %s values as their text', (typeName) => {
    expect(tableColumnOf(column({ typeName }))).toMatchObject({
      value: { type: 'json' },
      sql: AS_TEXT,
    })
  })

  it('should offer the values of an enum type, in order', () => {
    expect(
      tableColumnOf(column({ typeName: 'mood', typeType: 'e', labels: ['sad', 'ok'] })),
    ).toMatchObject({
      value: { type: 'choice', options: ['sad', 'ok'], isMultiple: false },
      sql: PLAIN,
    })
  })

  it.each([
    { typeName: 'inet' },
    { typeName: 'interval' },
    { typeName: '_int4', category: 'A' },
    { typeName: 'positive', typeType: 'd' },
    { typeName: 'int4range', typeType: 'r' },
    { typeName: 'address', typeType: 'c' },
  ])('should let the server check %j values, compared as text', (changes) => {
    expect(tableColumnOf(column(changes))).toMatchObject({
      value: { type: 'server' },
      sql: AS_TEXT,
    })
  })

  it.each([
    [{ isNullable: true }, true, true],
    [{ hasDefault: true }, true, true],
    [{ identity: 'd' }, true, true],
    [{ identity: 'a' }, true, false],
    [{ generated: 's' }, true, false],
    [{ generated: 'v' }, true, false],
    [{}, false, true],
  ])(
    'should tell from %j whether an INSERT can leave it out (%s) and it takes values (%s)',
    (changes, hasDefault, isWritable) => {
      expect(tableColumnOf(column(changes))).toMatchObject({ hasDefault, isWritable })
    },
  )
})
