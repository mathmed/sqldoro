import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest } from '../../../test/fakes/mysql2.ts'
import { MYSQL_DIALECT as EXPECTED_DIALECT } from '../../../test/fixtures/dialects.ts'
import { MYSQL_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { ObjectKind } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { mysqlEngine } from './mysql-engine.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

const ORDERS = { database: 'shop', schema: 'shop', name: 'orders' }

async function connected(): Promise<EngineSession> {
  return mysqlEngine.connect(mysqlRequest())
}

function lastSql(): string | undefined {
  return mysql.connections[0]?.queries.at(-1)?.sql
}

beforeEach(() => {
  mysql.reset()
  answerBy()
})

describe('the MySQL dialect', () => {
  it('should read SQL with the lexical rules of MySQL', () => {
    expect(mysqlEngine.dialect.lexical).toStrictEqual(MYSQL_LEXICAL)
    expect({ ...mysqlEngine.dialect, keywords: [] }).toStrictEqual({
      ...EXPECTED_DIALECT,
      keywords: [],
    })
    expect(mysqlEngine.dialect.keywords).toContain('SHOW')
  })
})

describe('objectDdl', () => {
  it('should show the CREATE TABLE statement of the server', async () => {
    answerBy([
      [
        'SHOW CREATE TABLE',
        { result: [{ Table: 'orders', 'Create Table': 'CREATE TABLE `orders` (`id` int)' }] },
      ],
    ])
    const sut = await connected()

    await expect(sut.objectDdl(ORDERS, ObjectKind.Table)).resolves.toBe(
      'CREATE TABLE `orders` (`id` int);',
    )
    expect(lastSql()).toBe('SHOW CREATE TABLE `shop`.`orders`')
  })

  it('should show the CREATE VIEW statement of the server', async () => {
    answerBy([
      [
        'SHOW CREATE VIEW',
        { result: [{ View: 'v', 'Create View': 'CREATE VIEW `v` AS select 1' }] },
      ],
    ])
    const sut = await connected()

    await expect(sut.objectDdl({ ...ORDERS, name: 'v`x' }, ObjectKind.View)).resolves.toBe(
      'CREATE VIEW `v` AS select 1;',
    )
    expect(lastSql()).toBe('SHOW CREATE VIEW `shop`.`v``x`')
  })

  it('should say when the server shows nothing', async () => {
    answerBy([['SHOW CREATE TABLE', { result: [] }]])
    const sut = await connected()

    await expect(sut.objectDdl(ORDERS, ObjectKind.Table)).rejects.toThrow(
      'MySQL did not show the definition of orders',
    )
  })
})

describe('useScope', () => {
  it('should switch to the database, quoted', async () => {
    const sut = await connected()

    await sut.useScope({ database: 'my`db', schema: 'my`db' })

    expect(lastSql()).toBe('USE `my``db`')
  })

  it('should stay in the default database without one', async () => {
    const sut = await connected()
    const before = mysql.connections[0]?.queries.length

    await sut.useScope({ database: '', schema: '' })

    expect(mysql.connections[0]?.queries.length).toBe(before)
  })
})
