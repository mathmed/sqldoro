import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import type { ForeignKeyInfo } from '../engine/catalog.ts'
import {
  foreignKeyLinks,
  linkAt,
  linkKey,
  linkLabel,
  referenceKey,
  referenceLabel,
  referencesOf,
  resultLinks,
  resultReferences,
  tableLabel,
  type TableLinks,
} from './links.ts'

const ACCOUNTS = { database: 'bank', schema: 'public', name: 'account' }
const CONDOMINIUM = { database: 'bank', schema: 'public', name: 'condominium' }
const FOREIGN_KEY: ForeignKeyInfo = {
  name: 'fk_condominium',
  columns: ['condominium_id', 'region'],
  referencedSchema: 'public',
  referencedTable: 'condominium',
  referencedColumns: ['id', 'region'],
  onUpdate: 'NO ACTION',
  onDelete: 'CASCADE',
}
const LINK = {
  name: 'fk_condominium',
  columns: ['condominium_id', 'region'],
  target: CONDOMINIUM,
  targetColumns: ['id', 'region'],
}
const REFERENCE = {
  name: 'fk_account',
  table: { database: 'bank', schema: 'audit', name: 'entry' },
  columns: ['account_id'],
  referencedColumns: ['id'],
}
const TABLES: readonly TableLinks[] = [{ table: 'a', foreignKeys: [LINK], references: [REFERENCE] }]

describe('foreignKeyLinks and referencesOf', () => {
  it('should find the target in the database of the table in PostgreSQL', () => {
    expect(foreignKeyLinks([FOREIGN_KEY], ACCOUNTS, POSTGRES_DIALECT)).toStrictEqual([LINK])
    expect(
      referencesOf(
        [
          {
            name: 'fk_account',
            schema: 'audit',
            table: 'entry',
            columns: ['account_id'],
            referencedColumns: ['id'],
          },
        ],
        ACCOUNTS,
        POSTGRES_DIALECT,
      ),
    ).toStrictEqual([REFERENCE])
  })

  it('should find the target in the database it names in MySQL', () => {
    const [link] = foreignKeyLinks(
      [{ ...FOREIGN_KEY, referencedSchema: 'crm' }],
      { database: 'shop', schema: 'shop', name: 'orders' },
      MYSQL_DIALECT,
    )

    expect(link?.target).toStrictEqual({ database: 'crm', schema: 'crm', name: 'condominium' })
  })
})

describe('resultLinks and resultReferences', () => {
  const sources = [
    { table: 'a', column: 'id' },
    undefined,
    { table: 'a', column: 'region' },
    { table: 'b', column: 'condominium_id' },
    { table: 'a', column: 'condominium_id' },
  ]

  it('should link the foreign keys whose columns the result holds', () => {
    expect(resultLinks(sources, TABLES)).toStrictEqual([
      {
        foreignKey: LINK,
        key: [
          { column: 'id', position: 4 },
          { column: 'region', position: 2 },
        ],
      },
    ])
  })

  it('should leave out a foreign key the result lacks a column of', () => {
    expect(resultLinks(sources.slice(0, 4), TABLES)).toStrictEqual([])
    expect(resultLinks([], TABLES)).toStrictEqual([])
  })

  it('should leave out a foreign key whose columns the catalog paired wrongly', () => {
    const broken = { ...LINK, targetColumns: ['id'] }

    expect(
      resultLinks(sources, [{ table: 'a', foreignKeys: [broken], references: [] }]),
    ).toStrictEqual([])
  })

  it('should offer the references whose referenced columns the result holds', () => {
    expect(resultReferences(sources, TABLES)).toStrictEqual([
      { reference: REFERENCE, key: [{ column: 'account_id', position: 0 }] },
    ])
    expect(resultReferences(sources.slice(1), TABLES)).toStrictEqual([])
  })
})

describe('linkAt, linkKey and referenceKey', () => {
  const link = {
    foreignKey: LINK,
    key: [
      { column: 'id', position: 2 },
      { column: 'region', position: 0 },
    ],
  }

  it('should find the link of a column', () => {
    expect(linkAt([link], 0)).toBe(link)
    expect(linkAt([link], 2)).toBe(link)
    expect(linkAt([link], 1)).toBeUndefined()
  })

  it('should read the key a row points at, unless a column of it is NULL', () => {
    expect(linkKey(link, ['south', 'x', 7])).toStrictEqual({
      parts: [
        { column: 'id', value: 7 },
        { column: 'region', value: 'south' },
      ],
      isRowKey: true,
    })
    expect(linkKey(link, ['south', 'x', null])).toBeUndefined()
    expect(linkKey(link, ['south'])).toBeUndefined()
  })

  it('should read the rows that reference a row', () => {
    const reference = { reference: REFERENCE, key: [{ column: 'account_id', position: 1 }] }

    expect(referenceKey(reference, ['x', '42'])).toStrictEqual({
      parts: [{ column: 'account_id', value: '42' }],
      isRowKey: false,
    })
    expect(referenceKey(reference, ['x', null])).toBeUndefined()
  })
})

describe('labels', () => {
  it('should name a table of the same schema alone, another with its schema', () => {
    expect(tableLabel(CONDOMINIUM, ACCOUNTS)).toBe('condominium')
    expect(tableLabel(REFERENCE.table, ACCOUNTS)).toBe('audit.entry')
  })

  it('should name what a link points at and what a reference holds', () => {
    expect(linkLabel(LINK, ACCOUNTS)).toBe('condominium (id, region)')
    expect(referenceLabel(REFERENCE, ACCOUNTS)).toBe('audit.entry (account_id)')
    expect(referenceLabel({ ...REFERENCE, columns: ['account_id', 'region'] }, ACCOUNTS)).toBe(
      'audit.entry (account_id, region)',
    )
  })
})
