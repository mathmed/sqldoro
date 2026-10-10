import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { decodeList, encodeList } from '../json/versioned-list.ts'
import { BINDING_FORMAT, bindingScope, describeBinding } from './binding.ts'

describe('bindingScope', () => {
  it('should use the database as the schema in MySQL', () => {
    expect(
      bindingScope({ connectionId: 'c', database: 'shop', schema: 'ignored' }, MYSQL_DIALECT),
    ).toStrictEqual({
      database: 'shop',
      schema: 'shop',
    })
  })

  it('should use the chosen schema in PostgreSQL, else the default one', () => {
    expect(
      bindingScope({ connectionId: 'c', database: 'shop', schema: 'sales' }, POSTGRES_DIALECT),
    ).toStrictEqual({
      database: 'shop',
      schema: 'sales',
    })
    expect(
      bindingScope({ connectionId: 'c', database: 'shop', schema: '' }, POSTGRES_DIALECT),
    ).toStrictEqual({
      database: 'shop',
      schema: 'public',
    })
  })
})

describe('describeBinding', () => {
  it('should name the connection, the database and the schema where there are schemas', () => {
    expect(describeBinding('Shop', { database: 'shop', schema: 'public' }, true)).toBe(
      'Shop › shop.public',
    )
    expect(describeBinding('Shop', { database: 'shop', schema: '' }, true)).toBe('Shop › shop')
    expect(describeBinding('Shop', { database: 'shop', schema: 'shop' }, false)).toBe('Shop › shop')
  })

  it('should name the connection alone without a database', () => {
    expect(describeBinding('Shop', { database: '', schema: '' }, true)).toBe('Shop')
  })
})

describe('BINDING_FORMAT', () => {
  it('should read back what it wrote', () => {
    const bindings = [{ uri: 'untitled:Untitled-1', connectionId: 'c', database: 'd', schema: 's' }]

    expect(
      decodeList(
        JSON.parse(JSON.stringify(encodeList(bindings, [], BINDING_FORMAT))),
        BINDING_FORMAT,
      ).items,
    ).toStrictEqual(bindings)
    expect(decodeList({ version: 1, bindings: 'none' }, BINDING_FORMAT).problems).toStrictEqual([
      'The editor connections cannot be read: "bindings" must be a list',
    ])
    expect(decodeList({ version: 1, bindings: [{}] }, BINDING_FORMAT).problems).toStrictEqual([
      'Editor connection #1 cannot be read: "uri" must be a string',
    ])
  })
})
