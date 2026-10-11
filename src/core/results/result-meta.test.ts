import { describe, expect, it } from 'vitest'

import { tableColumn } from '../../../test/fixtures/tables.ts'
import { ColumnKind, type ResultColumn } from '../engine/query.ts'
import { RelationKind, type TableDescription, ValueType } from '../engine/table.ts'
import {
  columnSources,
  type DescribedTable,
  NO_META,
  resultMeta,
  rowLabel,
  tableKey,
} from './result-meta.ts'

const ACCOUNT_REF = { database: 'bank', schema: 'public', name: 'account' }
const CONDOMINIUM = { database: 'bank', schema: 'public', name: 'condominium' }
const ACCOUNT: TableDescription = {
  ref: ACCOUNT_REF,
  kind: RelationKind.Table,
  problem: '',
  columns: [
    tableColumn('id', {
      reference: '1',
      sql: { parameterType: 'SIGNED', comparedAs: '', collation: '' },
    }),
    tableColumn('condominium_id', { reference: '2' }),
    tableColumn('status', {
      reference: '3',
      value: { type: ValueType.Choice, options: ['open', 'closed'], isMultiple: false },
    }),
  ],
  keys: [['id']],
}
const DESCRIBED: DescribedTable = {
  key: tableKey(['16510']),
  description: ACCOUNT,
  links: {
    table: tableKey(['16510']),
    foreignKeys: [
      {
        name: 'fk_condominium',
        columns: ['condominium_id'],
        target: CONDOMINIUM,
        targetColumns: ['id'],
      },
    ],
    references: [
      {
        name: 'fk_account',
        table: { database: 'bank', schema: 'audit', name: 'entry' },
        columns: ['account_id'],
        referencedColumns: ['id'],
      },
    ],
  },
}

function column(name: string, origin?: string): ResultColumn {
  return {
    name,
    dataType: 'int4',
    kind: ColumnKind.Number,
    ...(origin === undefined ? {} : { origin: { table: ['16510'], column: origin } }),
  }
}

const COLUMNS = [column('status', '3'), column('total'), column('fk', '2'), column('key', '1')]

describe('columnSources', () => {
  it('should name the table column each result column comes from', () => {
    expect(
      columnSources(
        [...COLUMNS, { ...column('x'), origin: { table: ['9'], column: '1' } }],
        [DESCRIBED],
      ),
    ).toStrictEqual([
      { table: '["16510"]', column: 'status' },
      undefined,
      { table: '["16510"]', column: 'condominium_id' },
      { table: '["16510"]', column: 'id' },
      undefined,
    ])
  })
})

describe('resultMeta', () => {
  it('should say what the catalog says of the columns of the result', () => {
    const sut = resultMeta(COLUMNS, [DESCRIBED])

    expect(sut.columns).toStrictEqual([
      { choices: ['open', 'closed'], reference: '' },
      { choices: [], reference: '' },
      { choices: [], reference: 'condominium (id)' },
      { choices: [], reference: '' },
    ])
    expect(sut.links).toStrictEqual([
      { foreignKey: DESCRIBED.links.foreignKeys[0], key: [{ column: 'id', position: 2 }] },
    ])
    expect(sut.references).toStrictEqual([
      { reference: DESCRIBED.links.references[0], key: [{ column: 'account_id', position: 3 }] },
    ])
    expect(sut.referenceLabels).toStrictEqual(['audit.entry (account_id)'])
    expect(sut.parameterTypes).toStrictEqual(new Map([['key', 'SIGNED']]))
    expect(sut.rowKey).toStrictEqual([{ column: 'id', position: 3 }])
    expect(sut.home).toBe(ACCOUNT_REF)
  })

  it('should know nothing of a result whose tables the catalog did not describe', () => {
    expect(resultMeta(COLUMNS, [])).toStrictEqual({
      ...NO_META,
      columns: COLUMNS.map(() => ({ choices: [], reference: '' })),
    })
  })

  it('should leave the row key out when the result lacks a column of it', () => {
    expect(resultMeta(COLUMNS.slice(0, 3), [DESCRIBED]).rowKey).toStrictEqual([])
    expect(
      resultMeta(COLUMNS, [{ ...DESCRIBED, description: { ...ACCOUNT, keys: [] } }]).rowKey,
    ).toStrictEqual([])
  })
})

describe('rowLabel', () => {
  const meta = resultMeta(COLUMNS, [DESCRIBED])

  it('should name a row by its key', () => {
    expect(rowLabel(meta, ['open', null, 1, 42])).toBe('#42')
  })

  it('should name no row without its key', () => {
    expect(rowLabel(meta, ['open', null, 1, null])).toBe('')
    expect(rowLabel(meta, ['open'])).toBe('')
    expect(rowLabel(NO_META, ['open', null, 1, 42])).toBe('')
  })
})

describe('resultMeta, at the edges', () => {
  it('should name no table nowhere', () => {
    expect(NO_META.home).toStrictEqual({ database: '', schema: '', name: '' })
  })

  it('should find each column in the table it comes from, among several', () => {
    const statuses = tableColumn('status', {
      reference: '3',
      value: { type: ValueType.Choice, options: ['paid', 'due'], isMultiple: false },
    })
    const other: DescribedTable = {
      ...DESCRIBED,
      key: tableKey(['900']),
      description: { ...ACCOUNT, columns: [statuses] },
    }
    const columns = [{ ...column('status'), origin: { table: ['900'], column: '3' } }]

    const sut = resultMeta(columns, [DESCRIBED, other])

    expect(sut.columns).toStrictEqual([{ choices: ['paid', 'due'], reference: '' }])
  })

  it('should name no row by a key the result does not hold whole, or without a key', () => {
    const composite: DescribedTable = {
      ...DESCRIBED,
      description: { ...ACCOUNT, keys: [['id', 'condominium_id']] },
    }
    const keyless: DescribedTable = { ...DESCRIBED, description: { ...ACCOUNT, keys: [] } }
    const onlyId = [column('key', '1')]

    expect(resultMeta(onlyId, [composite]).rowKey).toStrictEqual([])
    expect(resultMeta(onlyId, [keyless]).rowKey).toStrictEqual([])
  })

  it('should name a row by the first key of its table only', () => {
    const twoKeys: DescribedTable = {
      ...DESCRIBED,
      description: { ...ACCOUNT, keys: [['id'], ['condominium_id']] },
    }

    expect(resultMeta(COLUMNS, [twoKeys]).rowKey).toStrictEqual([{ column: 'id', position: 3 }])
  })
})
