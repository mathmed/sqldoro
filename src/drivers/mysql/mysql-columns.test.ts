import { describe, expect, it } from 'vitest'

import { choicesOf, type MysqlColumn, tableColumnOf } from './mysql-columns.ts'

const PLAIN = { parameterType: '', comparedAs: '', collation: '' }
const EXACT_TEXT = { ...PLAIN, collation: 'utf8mb4_bin' }

function column(changes: Partial<MysqlColumn>): MysqlColumn {
  return {
    name: 'value',
    columnType: 'int',
    dataType: 'int',
    isNullable: false,
    hasExplicitDefault: false,
    extra: '',
    maxLength: undefined,
    precision: undefined,
    scale: undefined,
    fraction: undefined,
    ...changes,
  }
}

describe('tableColumnOf', () => {
  it('should name the column by itself and keep its whole type', () => {
    expect(tableColumnOf(column({ name: 'Total', columnType: 'int unsigned' }))).toMatchObject({
      name: 'Total',
      reference: 'Total',
      dataType: 'int unsigned',
    })
  })

  it.each([
    { dataType: 'tinyint', columnType: 'tinyint', min: '-128', max: '127', cast: 'SIGNED' },
    { dataType: 'smallint', columnType: 'smallint', min: '-32768', max: '32767', cast: 'SIGNED' },
    {
      dataType: 'mediumint',
      columnType: 'mediumint',
      min: '-8388608',
      max: '8388607',
      cast: 'SIGNED',
    },
    { dataType: 'int', columnType: 'int', min: '-2147483648', max: '2147483647', cast: 'SIGNED' },
    {
      dataType: 'BIGINT',
      columnType: 'bigint',
      min: '-9223372036854775808',
      max: '9223372036854775807',
      cast: 'SIGNED',
    },
    { dataType: 'tinyint', columnType: 'tinyint unsigned', min: '0', max: '255', cast: 'UNSIGNED' },
    {
      dataType: 'smallint',
      columnType: 'smallint unsigned',
      min: '0',
      max: '65535',
      cast: 'UNSIGNED',
    },
    {
      dataType: 'mediumint',
      columnType: 'mediumint UNSIGNED zerofill',
      min: '0',
      max: '16777215',
      cast: 'UNSIGNED',
    },
    { dataType: 'int', columnType: 'int unsigned', min: '0', max: '4294967295', cast: 'UNSIGNED' },
    {
      dataType: 'bigint',
      columnType: 'bigint unsigned',
      min: '0',
      max: '18446744073709551615',
      cast: 'UNSIGNED',
    },
  ])('should check $columnType from $min to $max, cast as $cast', ({ cast, ...type }) => {
    const { dataType, columnType, min, max } = type
    expect(tableColumnOf(column({ dataType, columnType }))).toMatchObject({
      value: { type: 'integer', min, max },
      sql: { ...PLAIN, parameterType: cast },
    })
  })

  it('should check decimals against their precision and scale, cast to the same type', () => {
    expect(tableColumnOf(column({ dataType: 'decimal', precision: 10, scale: 2 }))).toMatchObject({
      value: { type: 'decimal', precision: 10, scale: 2 },
      sql: { ...PLAIN, parameterType: 'DECIMAL(10,2)' },
    })
    expect(tableColumnOf(column({ dataType: 'decimal' }))).toMatchObject({
      value: { type: 'decimal', precision: 0, scale: 0 },
      sql: { parameterType: 'DECIMAL(0,0)' },
    })
  })

  it.each([
    ['float', 'FLOAT'],
    ['double', 'DOUBLE'],
  ])('should compare %s values as %s', (dataType, parameterType) => {
    expect(tableColumnOf(column({ dataType }))).toMatchObject({
      value: { type: 'float' },
      sql: { ...PLAIN, parameterType },
    })
  })

  it.each(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext'])(
    'should check the length of %s values and compare them exactly',
    (dataType) => {
      expect(tableColumnOf(column({ dataType, maxLength: 20 }))).toMatchObject({
        value: { type: 'text', maxLength: 20 },
        sql: EXACT_TEXT,
      })
    },
  )

  it('should not limit text whose length the server does not give', () => {
    expect(tableColumnOf(column({ dataType: 'text' })).value).toStrictEqual({
      type: 'text',
      maxLength: 0,
    })
  })

  it('should offer the values of an enum, or several of a set', () => {
    expect(
      tableColumnOf(column({ dataType: 'enum', columnType: "enum('new','it''s done')" })),
    ).toMatchObject({
      value: { type: 'choice', options: ['new', "it's done"], isMultiple: false },
      sql: EXACT_TEXT,
    })
    expect(tableColumnOf(column({ dataType: 'set', columnType: "set('a','b,c')" })).value).toEqual({
      type: 'choice',
      options: ['a', 'b,c'],
      isMultiple: true,
    })
  })

  it.each([
    ['date', { type: 'date', minYear: 1000, maxYear: 9999 }],
    [
      'datetime',
      { type: 'timestamp', fraction: 3, hasTimeZone: false, minYear: 1000, maxYear: 9999 },
    ],
    [
      'timestamp',
      { type: 'timestamp', fraction: 3, hasTimeZone: false, minYear: 1970, maxYear: 2038 },
    ],
    ['time', { type: 'time', fraction: 3, maxHour: 838, hasTimeZone: false }],
    ['year', { type: 'year' }],
  ])('should check %s values', (dataType, value) => {
    expect(tableColumnOf(column({ dataType, fraction: 3 }))).toMatchObject({ value, sql: PLAIN })
  })

  it('should read times without a fraction of a second when the server gives none', () => {
    expect(tableColumnOf(column({ dataType: 'datetime' })).value).toMatchObject({ fraction: 0 })
    expect(tableColumnOf(column({ dataType: 'time' })).value).toMatchObject({ fraction: 0 })
  })

  it('should compare JSON as the text the server writes', () => {
    expect(tableColumnOf(column({ dataType: 'json' }))).toMatchObject({
      value: { type: 'json' },
      sql: { ...EXACT_TEXT, comparedAs: 'CHAR' },
    })
  })

  it.each([
    ['binary', 'Binary values are shown read-only.'],
    ['varbinary', 'Binary values are shown read-only.'],
    ['tinyblob', 'Binary values are shown read-only.'],
    ['blob', 'Binary values are shown read-only.'],
    ['mediumblob', 'Binary values are shown read-only.'],
    ['longblob', 'Binary values are shown read-only.'],
    ['bit', 'Binary values are shown read-only.'],
    ['geometry', 'Spatial values are shown read-only.'],
    ['point', 'Spatial values are shown read-only.'],
    ['linestring', 'Spatial values are shown read-only.'],
    ['polygon', 'Spatial values are shown read-only.'],
    ['multipoint', 'Spatial values are shown read-only.'],
    ['multilinestring', 'Spatial values are shown read-only.'],
    ['multipolygon', 'Spatial values are shown read-only.'],
    ['geomcollection', 'Spatial values are shown read-only.'],
    ['geometrycollection', 'Spatial values are shown read-only.'],
    ['vector', 'sqldoro does not edit vector values.'],
  ])('should show %s values read-only', (dataType, reason) => {
    expect(tableColumnOf(column({ dataType }))).toMatchObject({
      value: { type: 'readOnly', reason },
      sql: PLAIN,
    })
  })

  it.each([
    [{ isNullable: true }, true, true],
    [{ hasExplicitDefault: true }, true, true],
    [{ extra: 'auto_increment' }, true, true],
    [{ extra: 'DEFAULT_GENERATED' }, false, true],
    [{ extra: 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP' }, false, true],
    [{ extra: 'VIRTUAL GENERATED' }, true, false],
    [{ extra: 'STORED GENERATED' }, true, false],
    [{}, false, true],
  ])(
    'should tell from %j whether an INSERT can leave it out (%s) and it takes values (%s)',
    (changes, hasDefault, isWritable) => {
      expect(tableColumnOf(column(changes))).toMatchObject({ hasDefault, isWritable })
    },
  )

  it('should count a DEFAULT_GENERATED column as having a default through its default value', () => {
    expect(
      tableColumnOf(column({ extra: 'DEFAULT_GENERATED', hasExplicitDefault: true })),
    ).toMatchObject({ hasDefault: true, isWritable: true })
  })
})

describe('choicesOf', () => {
  it.each([
    ["enum('a')", ['a']],
    ["enum('','x y')", ['', 'x y']],
    ["set('it''s','a,b','''')", ["it's", 'a,b', "'"]],
    ['enum()', []],
    [
      "enum('a\\\\b','line\\nbreak','cr\\rx','tab\there','zero\\0x','z\\Zx','\\%','dq\"x')",
      ['a\\b', 'line\nbreak', 'cr\rx', 'tab\there', 'zero\0x', 'z\u001Ax', '%', 'dq"x'],
    ],
  ])('should read the values of %s', (columnType, values) => {
    expect(choicesOf(columnType)).toStrictEqual(values)
  })
})
