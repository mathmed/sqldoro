import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { Uri } from '../../../test/vscode.ts'
import { isTableKey, TABLE_SCHEME, tableBinding, tableTargetOf, tableUri } from './table-uri.ts'

const TARGET = {
  connectionId: 'shop',
  table: { database: 'shop', schema: 'sales', name: 'orders' },
}
const EDITOR = Uri.parse('untitled:Untitled-1') as unknown as vscode.Uri

describe('tableUri and tableTargetOf', () => {
  it('should name the connection, the database, the schema and the table, and read them back', () => {
    const uri = tableUri(TARGET)

    expect(uri.scheme).toBe(TABLE_SCHEME)
    expect(uri.path).toBe('/orders')
    expect(tableTargetOf(uri)).toStrictEqual(TARGET)
  })

  it('should give the same table the same key, and other tables other keys', () => {
    const key = tableUri(TARGET).toString()
    const elsewhere = [
      { ...TARGET, connectionId: 'crm' },
      { ...TARGET, table: { ...TARGET.table, database: 'archive' } },
      { ...TARGET, table: { ...TARGET.table, schema: 'public' } },
      { ...TARGET, table: { ...TARGET.table, name: 'customers' } },
    ]

    expect(tableUri({ ...TARGET, table: { ...TARGET.table } }).toString()).toBe(key)
    expect(new Set(elsewhere.map((target) => tableUri(target).toString())).has(key)).toBe(false)
  })

  it('should name no table for the URI of an editor', () => {
    expect(tableTargetOf(EDITOR)).toBeUndefined()
  })

  it('should refuse a table URI that does not name a table', () => {
    const uri = Uri.from({ scheme: TABLE_SCHEME, path: '/x', query: '{"connectionId":"shop"}' })

    expect(() => tableTargetOf(uri as unknown as vscode.Uri)).toThrow(
      new TypeError('"database" must be a string'),
    )
  })
})

describe('isTableKey', () => {
  it('should tell the keys of table panels from the keys of editors', () => {
    expect(isTableKey(tableUri(TARGET).toString())).toBe(true)
    expect(isTableKey(EDITOR.toString())).toBe(false)
    expect(isTableKey('file:/sqldoro-table:/orders')).toBe(false)
  })
})

describe('tableBinding', () => {
  it('should run a table panel on the connection, database and schema of its table', () => {
    expect(tableBinding(tableUri(TARGET))).toStrictEqual({
      connectionId: 'shop',
      database: 'shop',
      schema: 'sales',
    })
  })

  it('should have no binding of its own for an editor', () => {
    expect(tableBinding(EDITOR)).toBeUndefined()
  })
})
