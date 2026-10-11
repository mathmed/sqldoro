import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, pg, pgRequest } from '../../../test/fakes/pg.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { postgresEngine } from './postgres-engine.ts'

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { FakeClient } = await import('../../../test/fakes/pg.ts')
  return { default: { ...original.default, Client: FakeClient } }
})
vi.mock('pg-cursor', async () => {
  const { FakeCursor } = await import('../../../test/fakes/pg.ts')
  return { default: FakeCursor }
})

const ORDERS = ['16510']
const RELATION = { schema: 'sales', name: 'orders', kind: 'r', hasChildren: false }

type CatalogRow = Record<string, unknown>

function columnRow(name: string, changes: CatalogRow = {}): CatalogRow {
  return {
    reference: '1',
    name,
    dataType: 'integer',
    typeName: 'int4',
    typeType: 'b',
    category: 'N',
    isNullable: false,
    hasDefault: false,
    identity: '',
    generated: '',
    modifier: -1,
    labels: null,
    ...changes,
  }
}

async function connected(): Promise<EngineSession> {
  return postgresEngine.connect(pgRequest())
}

function answerTable(relation: readonly CatalogRow[], keys: readonly CatalogRow[] = []): void {
  answerBy([
    ['SELECT n.nspname', { rows: relation }],
    [
      'SELECT a.attnum',
      {
        rows: [
          columnRow('id'),
          columnRow('mood', { typeName: 'mood', typeType: 'e', labels: '["sad","ok"]' }),
        ],
      },
    ],
    ['SELECT i.indexrelid', { rows: keys }],
  ])
}

function catalogQueries(): readonly { sql: string; values: readonly unknown[] }[] {
  return pg.clients.flatMap((client) => client.queries).filter(({ values }) => values.length > 0)
}

beforeEach(() => {
  pg.reset()
})

describe('describeTable (PostgreSQL)', () => {
  it('should describe the relation an object id names, in the database the session opened', async () => {
    answerTable([RELATION])
    const sut = await connected()

    const table = await sut.describeTable('', ORDERS)

    expect(table).toMatchObject({
      ref: { database: 'shop', schema: 'sales', name: 'orders' },
      kind: 'table',
      problem: '',
      keys: [],
    })
    expect(table?.columns.map((column) => column.value)).toStrictEqual([
      { type: 'integer', min: '-2147483648', max: '2147483647' },
      { type: 'choice', options: ['sad', 'ok'], isMultiple: false },
    ])
    expect(catalogQueries().map(({ values }) => values)).toStrictEqual([ORDERS, ORDERS, ORDERS])
  })

  it('should read the catalog of another database on its own connection', async () => {
    answerTable([RELATION])
    const sut = await connected()

    await expect(sut.describeTable('archive', ORDERS)).resolves.toMatchObject({
      ref: { database: 'archive' },
    })
    expect(pg.clients.map((client) => client.config.database)).toStrictEqual(['shop', 'archive'])
  })

  it('should keep the valid unique keys on columns that refuse NULL, primary key first', async () => {
    answerTable(
      [RELATION],
      [
        { index: '1', column: 'id', isNotNull: true },
        { index: '1', column: 'line', isNotNull: true },
        { index: '2', column: 'code', isNotNull: true },
        { index: '3', column: 'email', isNotNull: false },
        { index: '4', column: null, isNotNull: null },
      ],
    )
    const sut = await connected()

    await expect(sut.describeTable('', ORDERS)).resolves.toMatchObject({
      keys: [['id', 'line'], ['code']],
    })
  })

  it.each([
    { kind: 'p', hasChildren: true, type: 'table', problem: '' },
    { kind: 'r', hasChildren: false, type: 'table', problem: '' },
    {
      kind: 'r',
      hasChildren: true,
      type: 'table',
      problem:
        'Other tables inherit from "orders": their rows show in it, and their keys may repeat. sqldoro does not edit it.',
    },
    { kind: 'v', hasChildren: false, type: 'view', problem: '' },
    { kind: 'm', hasChildren: false, type: 'materializedView', problem: '' },
    { kind: 'f', hasChildren: false, type: 'foreignTable', problem: '' },
    { kind: 'S', hasChildren: false, type: 'other', problem: '' },
  ])('should tell a relation of kind $kind (children: $hasChildren) apart', async (expected) => {
    const { kind, hasChildren, type, problem } = expected
    answerTable([{ ...RELATION, kind, hasChildren }])
    const sut = await connected()

    await expect(sut.describeTable('', ORDERS)).resolves.toMatchObject({ kind: type, problem })
  })

  it('should not know a relation the catalog does not list', async () => {
    answerTable([])
    const sut = await connected()

    await expect(sut.describeTable('', ORDERS)).resolves.toBeUndefined()
    expect(catalogQueries()).toHaveLength(1)
  })

  it.each([[[]], [['0']], [['016510']], [['16510', '2']], [['orders']], [['-1']]])(
    'should not know a relation named by %j',
    async (table) => {
      const sut = await connected()

      await expect(sut.describeTable('', table)).resolves.toBeUndefined()
      expect(catalogQueries()).toHaveLength(0)
    },
  )

  it('should refuse enum values described as something else than a list of text', async () => {
    answerBy([
      ['SELECT n.nspname', { rows: [RELATION] }],
      ['SELECT a.attnum', { rows: [columnRow('mood', { typeType: 'e', labels: '[1]' })] }],
    ])
    const sut = await connected()

    await expect(sut.describeTable('', ORDERS)).rejects.toThrow(
      new TypeError('PostgreSQL described the values of an enum type as something else'),
    )
  })

  it('should refuse enum values that are not a list', async () => {
    answerBy([
      ['SELECT n.nspname', { rows: [RELATION] }],
      ['SELECT a.attnum', { rows: [columnRow('mood', { typeType: 'e', labels: '{"a": 1}' })] }],
    ])
    const sut = await connected()

    await expect(sut.describeTable('', ORDERS)).rejects.toThrow(TypeError)
  })
})

describe('describeTableAt (PostgreSQL)', () => {
  it('should find the object id of a table by its schema and name, then describe it', async () => {
    answerBy([
      ['SELECT c.oid::text AS id', { rows: [{ id: '16510' }] }],
      ['SELECT n.nspname', { rows: [RELATION] }],
      ['SELECT a.attnum', { rows: [columnRow('id')] }],
      ['SELECT i.indexrelid', { rows: [] }],
    ])
    const sut = await connected()

    await expect(
      sut.describeTableAt({ database: '', schema: 'sales', name: 'orders' }),
    ).resolves.toMatchObject({ ref: { database: 'shop', schema: 'sales', name: 'orders' } })
    expect(catalogQueries().map(({ values }) => values)).toStrictEqual([
      ['sales', 'orders'],
      ['16510'],
      ['16510'],
      ['16510'],
    ])
  })

  it('should not know a table that is not there', async () => {
    answerBy([['SELECT c.oid::text AS id', { rows: [] }]])
    const sut = await connected()

    await expect(
      sut.describeTableAt({ database: 'shop', schema: 'sales', name: 'gone' }),
    ).resolves.toBeUndefined()
    expect(catalogQueries()).toHaveLength(1)
  })
})

describe('writeProblem (PostgreSQL)', () => {
  it('should have none: PostgreSQL refuses what a column cannot hold', async () => {
    const sut = await connected()

    await expect(sut.writeProblem()).resolves.toBeUndefined()
  })
})
