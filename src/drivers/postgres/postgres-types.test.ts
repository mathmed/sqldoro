import pg from 'pg'
import { describe, expect, it } from 'vitest'

import { toResultColumn } from './postgres-types.ts'

const { builtins } = pg.types
const COMPUTED = { tableID: 0, columnID: 0 }

describe('toResultColumn', () => {
  it.each([
    [builtins.INT8, 'INT8', 'number'],
    [builtins.NUMERIC, 'NUMERIC', 'number'],
    [builtins.FLOAT8, 'FLOAT8', 'number'],
    [builtins.BOOL, 'BOOL', 'boolean'],
    [builtins.TIMESTAMPTZ, 'TIMESTAMPTZ', 'temporal'],
    [builtins.INTERVAL, 'INTERVAL', 'temporal'],
    [builtins.JSONB, 'JSONB', 'json'],
    [builtins.JSON, 'JSON', 'json'],
    [builtins.BYTEA, 'BYTEA', 'binary'],
    [builtins.UUID, 'UUID', 'text'],
    [builtins.VARCHAR, 'VARCHAR', 'text'],
    [builtins.MONEY, 'MONEY', 'other'],
  ])('should read type %i as %s holding %s', (dataTypeID, dataType, kind) => {
    expect(toResultColumn({ name: 'c', dataTypeID, ...COMPUTED })).toStrictEqual({
      name: 'c',
      dataType,
      kind,
    })
  })

  it('should name a type it does not know as unknown', () => {
    expect(toResultColumn({ name: 'c', dataTypeID: 999_999, ...COMPUTED })).toStrictEqual({
      name: 'c',
      dataType: 'UNKNOWN',
      kind: 'other',
    })
  })

  it('should say which relation and column a value comes from, by their numbers', () => {
    const field = { name: 'total', dataTypeID: builtins.INT4, tableID: 16_510, columnID: 3 }

    expect(toResultColumn(field).origin).toStrictEqual({ table: ['16510'], column: '3' })
  })

  it.each([
    { tableID: 0, columnID: 0 },
    { tableID: 16_510, columnID: 0 },
    { tableID: 0, columnID: 3 },
  ])('should give a computed value no origin: %j', (ids) => {
    expect(toResultColumn({ name: 'c', dataTypeID: builtins.INT4, ...ids })).toStrictEqual({
      name: 'c',
      dataType: 'INT4',
      kind: 'number',
    })
  })
})
