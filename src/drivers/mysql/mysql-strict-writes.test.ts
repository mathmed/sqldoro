import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest } from '../../../test/fakes/mysql2.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { mysqlEngine } from './mysql-engine.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

const READ_MODE = 'SELECT @@SESSION.sql_mode AS mode'
const SET_MODE = 'SET SESSION sql_mode = ?'

async function connected(): Promise<EngineSession> {
  return mysqlEngine.connect(mysqlRequest())
}

// What the session sent after it connected (the version query).
function sent(): readonly { readonly sql: string; readonly values: readonly unknown[] }[] {
  return (mysql.connections[0]?.queries ?? []).slice(1)
}

function answerMode(mode: string, setError?: Error): void {
  answerBy([
    ['SELECT @@SESSION.sql_mode', { result: [{ mode }] }],
    ['SET SESSION sql_mode', setError === undefined ? { result: {} } : { error: setError }],
  ])
}

beforeEach(() => {
  mysql.reset()
  answerBy()
})

describe('startStrictWrites (MySQL)', () => {
  it.each([
    'STRICT_TRANS_TABLES',
    'ONLY_FULL_GROUP_BY,STRICT_ALL_TABLES,NO_ZERO_DATE',
    'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES',
  ])('should change nothing in a session whose sql_mode is %s', async (mode) => {
    answerMode(mode)
    const sut = await connected()

    const restore = await sut.startStrictWrites()
    await restore()

    expect(sent()).toStrictEqual([{ sql: READ_MODE, values: [] }])
  })

  it.each([
    ['', 'STRICT_TRANS_TABLES'],
    ['ONLY_FULL_GROUP_BY', 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES'],
    [
      'NOT_STRICT_TRANS_TABLES_X,NO_ENGINE_SUBSTITUTION',
      'NOT_STRICT_TRANS_TABLES_X,NO_ENGINE_SUBSTITUTION,STRICT_TRANS_TABLES',
    ],
  ])(
    'should add strict mode to a session whose sql_mode is "%s", then put it back',
    async (original, strict) => {
      answerMode(original)
      const sut = await connected()

      const restore = await sut.startStrictWrites()
      expect(sent()).toStrictEqual([
        { sql: READ_MODE, values: [] },
        { sql: SET_MODE, values: [strict] },
      ])
      await restore()

      expect(sent().at(-1)).toStrictEqual({ sql: SET_MODE, values: [original] })
      expect(sent()).toHaveLength(3)
    },
  )

  it('should change nothing when the server does not say the sql_mode of the session', async () => {
    answerBy([['SELECT @@SESSION.sql_mode', { result: [] }]])
    const sut = await connected()

    await expect(sut.startStrictWrites()).rejects.toThrow(
      'The server did not say the sql_mode of the session.',
    )
    expect(sent()).toStrictEqual([{ sql: READ_MODE, values: [] }])
  })

  it('should fail with the error of the server when it cannot turn strict mode on', async () => {
    answerMode('', new Error("Variable 'sql_mode' can't be set"))
    const sut = await connected()

    await expect(sut.startStrictWrites()).rejects.toThrow("Variable 'sql_mode' can't be set")
  })

  it('should fail with the error of the server when it cannot put the sql_mode back', async () => {
    answerMode('ONLY_FULL_GROUP_BY')
    const sut = await connected()
    const restore = await sut.startStrictWrites()
    answerMode('ONLY_FULL_GROUP_BY', new Error('Lost connection to MySQL server'))

    await expect(restore()).rejects.toThrow('Lost connection to MySQL server')
  })
})
