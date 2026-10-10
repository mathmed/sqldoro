import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import {
  catalogNeeds,
  findReference,
  namedScope,
  NO_NEEDS,
  objectKey,
  resolveTable,
  scopeKey,
} from './catalog-needs.ts'
import { analyzeCompletion } from './context.ts'

const PG_SCOPE = { database: 'shop', schema: 'public' }
const MY_SCOPE = { database: 'shop', schema: 'shop' }

function pgNeeds(sqlWithCursor: string): ReturnType<typeof catalogNeeds> {
  const offset = sqlWithCursor.indexOf('|')
  const context = analyzeCompletion(sqlWithCursor.replace('|', ''), offset, POSTGRES_LEXICAL)
  return catalogNeeds(context, PG_SCOPE, POSTGRES_DIALECT)
}

function myNeeds(sqlWithCursor: string, scope = MY_SCOPE): ReturnType<typeof catalogNeeds> {
  const offset = sqlWithCursor.indexOf('|')
  const context = analyzeCompletion(sqlWithCursor.replace('|', ''), offset, MYSQL_LEXICAL)
  return catalogNeeds(context, scope, MYSQL_DIALECT)
}

describe('keys', () => {
  it('should key scopes and objects by all their names', () => {
    expect(scopeKey(PG_SCOPE)).toBe('["shop","public"]')
    expect(objectKey({ ...PG_SCOPE, name: 't' })).toBe('["shop","public","t"]')
  })
})

describe('namedScope and resolveTable', () => {
  it('should read a qualifier as a schema in PostgreSQL and a database in MySQL', () => {
    expect(namedScope('sales', PG_SCOPE, POSTGRES_DIALECT)).toStrictEqual({
      database: 'shop',
      schema: 'sales',
    })
    expect(namedScope('crm', MY_SCOPE, MYSQL_DIALECT)).toStrictEqual({
      database: 'crm',
      schema: 'crm',
    })
  })

  it('should resolve one or two part names and nothing longer or empty', () => {
    expect(resolveTable(['t'], PG_SCOPE, POSTGRES_DIALECT)).toStrictEqual({
      ...PG_SCOPE,
      name: 't',
    })
    expect(resolveTable(['s', 't'], PG_SCOPE, POSTGRES_DIALECT)).toStrictEqual({
      database: 'shop',
      schema: 's',
      name: 't',
    })
    expect(resolveTable(['a', 'b', 'c'], PG_SCOPE, POSTGRES_DIALECT)).toBeUndefined()
    expect(resolveTable([], PG_SCOPE, POSTGRES_DIALECT)).toBeUndefined()
  })
})

describe('findReference', () => {
  const references = [
    { parts: ['orders'], alias: 'O' },
    { parts: ['sales', 'Customers'], alias: undefined },
    { parts: ['items'], alias: undefined },
  ]

  it('should find a reference by its alias or, without one, by its table, without case', () => {
    expect(findReference(references, 'o')).toBe(references[0])
    expect(findReference(references, 'CUSTOMERS')).toBe(references[1])
    expect(findReference(references, 'Items')).toBe(references[2])
  })

  it('should not find a table by its name when it has an alias', () => {
    expect(findReference(references, 'orders')).toBeUndefined()
  })
})

describe('catalogNeeds', () => {
  it('should need nothing in text or anywhere names do not go', () => {
    expect(pgNeeds("SELECT 'a|")).toStrictEqual(NO_NEEDS)
    expect(pgNeeds("SELECT * FROM t WHERE a = 'x|")).toStrictEqual(NO_NEEDS)
    expect(pgNeeds('SELECT * FROM /* t|')).toStrictEqual(NO_NEEDS)
    expect(pgNeeds('|')).toStrictEqual(NO_NEEDS)
  })

  it('should need the schemas and the tables of the current schema where tables go in PostgreSQL', () => {
    expect(pgNeeds('SELECT * FROM |')).toStrictEqual({
      hasDatabases: false,
      schemasOf: 'shop',
      scopes: [PG_SCOPE],
      tables: [],
    })
  })

  it('should need the databases and the tables of the current database in MySQL', () => {
    expect(myNeeds('SELECT * FROM |')).toStrictEqual({
      hasDatabases: true,
      schemasOf: undefined,
      scopes: [MY_SCOPE],
      tables: [],
    })
  })

  it('should not list tables without a current database', () => {
    expect(myNeeds('SELECT * FROM |', { database: '', schema: '' }).scopes).toStrictEqual([])
  })

  it('should need the columns of every table of the statement where columns go, once each', () => {
    expect(pgNeeds('SELECT | FROM orders o JOIN sales.c ON true, orders').tables).toStrictEqual([
      { ...PG_SCOPE, name: 'orders' },
      { database: 'shop', schema: 'sales', name: 'c' },
    ])
  })

  it('should need the columns of at most 20 tables', () => {
    const tables = Array.from({ length: 25 }, (...[, index]) => `t${String(index)}`).join(', ')

    expect(pgNeeds(`SELECT | FROM ${tables}`).tables).toHaveLength(20)
  })

  it('should need the columns of the table an alias stands for', () => {
    expect(pgNeeds('SELECT o.| FROM sales.orders o')).toStrictEqual({
      ...NO_NEEDS,
      tables: [{ database: 'shop', schema: 'sales', name: 'orders' }],
    })
  })

  it('should need the objects of a schema, and the columns of a table of that name, after an unknown qualifier', () => {
    expect(pgNeeds('SELECT sales.|')).toStrictEqual({
      ...NO_NEEDS,
      scopes: [{ database: 'shop', schema: 'sales' }],
      tables: [{ ...PG_SCOPE, name: 'sales' }],
    })
    expect(pgNeeds('SELECT * FROM sales.|')).toStrictEqual({
      ...NO_NEEDS,
      scopes: [{ database: 'shop', schema: 'sales' }],
    })
    expect(myNeeds('SELECT * FROM crm.|').scopes).toStrictEqual([
      { database: 'crm', schema: 'crm' },
    ])
  })

  it('should need the columns of a schema-qualified table, and nothing for longer names', () => {
    expect(pgNeeds('SELECT sales.orders.|')).toStrictEqual({
      ...NO_NEEDS,
      tables: [{ database: 'shop', schema: 'sales', name: 'orders' }],
    })
    expect(pgNeeds('SELECT a.b.c.|')).toStrictEqual(NO_NEEDS)
  })
})
