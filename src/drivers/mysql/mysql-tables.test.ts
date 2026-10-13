import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest } from '../../../test/fakes/mysql2.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { mysqlEngine } from './mysql-engine.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

const ORDERS = ['shop', 'orders']
const BASE_TABLE = { tableType: 'BASE TABLE', engine: 'InnoDB' }

interface ColumnRow {
  readonly name: string
  readonly isNullable?: string
  readonly dataType?: string
}

function columnRow({ name, isNullable = 'NO', dataType = 'int' }: ColumnRow): object {
  return {
    name,
    columnType: dataType,
    dataType,
    isNullable,
    hasDefault: 'NO',
    extra: '',
    maxLength: null,
    numericPrecision: '10',
    numericScale: '0',
    fraction: null,
  }
}

const COLUMNS = [
  columnRow({ name: 'id' }),
  columnRow({ name: 'code', dataType: 'varchar' }),
  columnRow({ name: 'email', dataType: 'varchar', isNullable: 'YES' }),
  columnRow({ name: 'line' }),
]

async function connected(): Promise<EngineSession> {
  return mysqlEngine.connect(mysqlRequest())
}

function answerTable(
  relation: readonly object[],
  keys: readonly object[] = [],
  columns: readonly object[] = COLUMNS,
): void {
  answerBy([
    ['SELECT TABLE_TYPE', { result: relation }],
    ['SELECT COLUMN_NAME', { result: columns }],
    ['SELECT INDEX_NAME', { result: keys }],
  ])
}

beforeEach(() => {
  mysql.reset()
  answerBy()
})

describe('describeTableAt (MySQL)', () => {
  it('should describe a table by its database and its name', async () => {
    answerTable([BASE_TABLE])
    const sut = await connected()

    await expect(
      sut.describeTableAt({ database: 'shop', schema: 'shop', name: 'orders' }),
    ).resolves.toMatchObject({ ref: { database: 'shop', schema: 'shop', name: 'orders' } })
    expect(mysql.connections[0]?.queries.at(1)?.values).toStrictEqual(ORDERS)
  })
})

describe('describeTable (MySQL)', () => {
  it('should describe the table result columns come from, with bound names', async () => {
    answerTable([BASE_TABLE])
    const sut = await connected()

    const table = await sut.describeTable('', ORDERS)

    expect(table).toMatchObject({
      ref: { database: 'shop', schema: 'shop', name: 'orders' },
      kind: 'table',
      problem: '',
      keys: [],
    })
    expect(table?.columns.map((column) => [column.name, column.value.type])).toStrictEqual([
      ['id', 'integer'],
      ['code', 'text'],
      ['email', 'text'],
      ['line', 'integer'],
    ])
    expect(mysql.connections[0]?.queries.slice(1).map((query) => query.values)).toStrictEqual([
      ORDERS,
      ORDERS,
      ORDERS,
    ])
  })

  it('should read the lengths, precisions and fractions the server gives as text', async () => {
    answerTable(
      [BASE_TABLE],
      [],
      [
        { ...columnRow({ name: 'code', dataType: 'varchar' }), maxLength: '20' },
        { ...columnRow({ name: 'price', dataType: 'decimal' }), numericScale: '2' },
        { ...columnRow({ name: 'at', dataType: 'datetime' }), fraction: '3' },
      ],
    )
    const sut = await connected()

    const table = await sut.describeTable('', ORDERS)

    expect(table?.columns.map((column) => column.value)).toStrictEqual([
      { type: 'text', maxLength: 20 },
      { type: 'decimal', precision: 10, scale: 2 },
      { type: 'timestamp', fraction: 3, hasTimeZone: false, minYear: 1000, maxYear: 9999 },
    ])
  })

  it('should keep the unique keys made of columns that refuse NULL, primary key first', async () => {
    answerTable(
      [BASE_TABLE],
      [
        { indexName: 'PRIMARY', columnName: 'id' },
        { indexName: 'PRIMARY', columnName: 'line' },
        { indexName: 'by_code', columnName: 'code' },
        { indexName: 'by_email', columnName: 'email' },
        { indexName: 'by_lower', columnName: null },
        { indexName: 'by_mixed', columnName: 'code' },
        { indexName: 'by_mixed', columnName: null },
      ],
    )
    const sut = await connected()

    await expect(sut.describeTable('', ORDERS)).resolves.toMatchObject({
      keys: [['id', 'line'], ['code']],
    })
  })

  it.each([
    { tableType: 'VIEW', engine: '', kind: 'view', problem: '' },
    { tableType: 'SYSTEM VIEW', engine: '', kind: 'other', problem: '' },
    { tableType: 'BASE TABLE', engine: 'innodb', kind: 'table', problem: '' },
    {
      tableType: 'BASE TABLE',
      engine: 'MyISAM',
      kind: 'table',
      problem:
        '"orders" uses the MyISAM storage engine, which cannot roll changes back: sqldoro does not edit it.',
    },
  ])('should tell a $tableType on "$engine" apart', async ({ kind, problem, ...relation }) => {
    answerTable([relation])
    const sut = await connected()

    await expect(sut.describeTable('', ORDERS)).resolves.toMatchObject({ kind, problem })
  })

  it('should not know a table the catalog does not list', async () => {
    answerTable([])
    const sut = await connected()

    await expect(sut.describeTable('', ORDERS)).resolves.toBeUndefined()
    expect(mysql.connections[0]?.queries).toHaveLength(2)
  })

  it.each([[[]], [['orders']], [['shop', 'orders', 'extra']]])(
    'should not know a table named by %j',
    async (table) => {
      const sut = await connected()

      await expect(sut.describeTable('', table)).resolves.toBeUndefined()
      expect(mysql.connections[0]?.queries).toHaveLength(1)
    },
  )
})
