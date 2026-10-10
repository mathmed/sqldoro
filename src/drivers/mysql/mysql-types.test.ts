import type { FieldPacket } from 'mysql2'
import { describe, expect, it } from 'vitest'

import { toResultColumn } from './mysql-types.ts'

const BINARY_CHARSET = 63
const UTF8MB4 = 255

interface FieldParts {
  readonly columnType?: number
  readonly type?: number
  readonly characterSet?: number
}

function column(field: FieldParts): ReturnType<typeof toResultColumn> {
  return toResultColumn({ name: 'c', ...field } as unknown as FieldPacket)
}

describe('toResultColumn', () => {
  it.each([
    [8, 'LONGLONG', 'number'],
    [246, 'NEWDECIMAL', 'number'],
    [13, 'YEAR', 'number'],
    [12, 'DATETIME', 'temporal'],
    [10, 'DATE', 'temporal'],
    [245, 'JSON', 'json'],
    [16, 'BIT', 'binary'],
    [255, 'GEOMETRY', 'binary'],
    [253, 'VAR_STRING', 'text'],
    [247, 'ENUM', 'text'],
    [6, 'NULL', 'other'],
  ])('should read type %i as %s holding %s', (code, dataType, kind) => {
    expect(column({ columnType: code })).toStrictEqual({ name: 'c', dataType, kind })
  })

  it('should tell binary strings apart from text by their character set', () => {
    expect(column({ columnType: 252, characterSet: BINARY_CHARSET }).kind).toBe('binary')
    expect(column({ columnType: 252, characterSet: UTF8MB4 }).kind).toBe('text')
    expect(column({ columnType: 8, characterSet: BINARY_CHARSET }).kind).toBe('number')
  })

  it('should fall back to the old type field and to unknown', () => {
    expect(column({ type: 3 })).toStrictEqual({ name: 'c', dataType: 'LONG', kind: 'number' })
    expect(column({})).toStrictEqual({ name: 'c', dataType: 'UNKNOWN', kind: 'other' })
    expect(column({ columnType: 999 })).toStrictEqual({
      name: 'c',
      dataType: 'UNKNOWN',
      kind: 'other',
    })
  })
})
