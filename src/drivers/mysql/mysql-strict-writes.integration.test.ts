import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { firstRow, query } from '../../../test/integration/edits.ts'
import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { mysqlEngine } from './mysql-engine.ts'

const LOOSE = 'ONLY_FULL_GROUP_BY,NO_ENGINE_SUBSTITUTION'
const TOO_LONG = 'INSERT INTO it_strict_codes VALUES (?)'
const SETUP = [
  'DROP TABLE IF EXISTS it_strict_codes',
  'CREATE TABLE it_strict_codes (code varchar(4)) ENGINE=InnoDB',
]

let session: EngineSession
let observer: EngineSession

async function sessionMode(): Promise<unknown> {
  const row = await firstRow(session, 'SELECT @@SESSION.sql_mode')
  return row?.[0]
}

async function codes(): Promise<unknown> {
  const result = await query(observer, 'SELECT code FROM it_strict_codes ORDER BY code')
  return result.rows
}

describe('the strict writes of a real MySQL session', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await mysqlEngine.connect(connectRequest(MYSQL))
    })
    observer = await mysqlEngine.connect(connectRequest(MYSQL))
    for (const statement of SETUP) {
      await query(observer, statement)
    }
  })

  beforeEach(async () => {
    await query(observer, 'DELETE FROM it_strict_codes')
  })

  afterAll(async () => {
    await Promise.all([session.close(), observer.close()])
  })

  it.each(['', LOOSE])(
    'should refuse what a column cannot hold in a session whose sql_mode is "%s", then put it back',
    async (mode) => {
      await query(session, 'SET SESSION sql_mode = ?', [mode])
      await query(session, TOO_LONG, ['cut me'])
      await expect(codes()).resolves.toStrictEqual([['cut ']])
      await query(observer, 'DELETE FROM it_strict_codes')

      const restore = await session.startStrictWrites()
      await expect(sessionMode()).resolves.toMatch(/STRICT_TRANS_TABLES/)
      await expect(query(session, TOO_LONG, ['cut me'])).rejects.toThrow(/Data too long/)
      await query(session, TOO_LONG, ['fits'])
      await restore()

      await expect(sessionMode()).resolves.toBe(mode)
      await expect(codes()).resolves.toStrictEqual([['fits']])
    },
  )

  it('should leave a strict session as it is', async () => {
    await query(session, "SET SESSION sql_mode = 'STRICT_ALL_TABLES'")

    const restore = await session.startStrictWrites()
    await expect(sessionMode()).resolves.toBe('STRICT_ALL_TABLES')
    await restore()

    await expect(sessionMode()).resolves.toBe('STRICT_ALL_TABLES')
  })

  it('should change neither the server nor the other sessions', async () => {
    const global = await firstRow(observer, 'SELECT @@GLOBAL.sql_mode, @@SESSION.sql_mode')
    await query(session, 'SET SESSION sql_mode = ?', [LOOSE])

    const restore = await session.startStrictWrites()

    await expect(
      firstRow(observer, 'SELECT @@GLOBAL.sql_mode, @@SESSION.sql_mode'),
    ).resolves.toStrictEqual(global)
    await restore()
  })
})
