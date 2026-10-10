import pg from 'pg'
import { describe, expect, it } from 'vitest'

import { toResultColumn } from './postgres-types.ts'

const { builtins } = pg.types

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
    expect(toResultColumn({ name: 'c', dataTypeID })).toStrictEqual({ name: 'c', dataType, kind })
  })

  it('should name a type it does not know as unknown', () => {
    expect(toResultColumn({ name: 'c', dataTypeID: 999_999 })).toStrictEqual({
      name: 'c',
      dataType: 'UNKNOWN',
      kind: 'other',
    })
  })
})
