import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type FakeClient, pg, pgRequest } from '../../../test/fakes/pg.ts'
import { queryRequest } from '../../../test/fakes/query-request.ts'
import { POSTGRES_DIALECT as EXPECTED_DIALECT } from '../../../test/fixtures/dialects.ts'
import { POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { postgresEngine } from './postgres-engine.ts'

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { FakeClient: Client } = await import('../../../test/fakes/pg.ts')
  return { default: { ...original.default, Client } }
})
vi.mock('pg-cursor', async () => {
  const { FakeCursor } = await import('../../../test/fakes/pg.ts')
  return { default: FakeCursor }
})

const SESSION_INFO = { version: '18.6', pid: 4242, database: 'shop' }
const CRM_PID = 77

// Each database client answers its own backend id.
function answerPids(): void {
  pg.script.answer = (query, client) => {
    if (query.sql.includes('current_setting')) {
      return { rows: [SESSION_INFO] }
    }
    const isCrm = client.config.database === 'crm'
    return query.sql.includes('pg_backend_pid()')
      ? { rows: [{ pid: isCrm ? CRM_PID : 4242 }] }
      : { rows: [] }
  }
}

function sqlOf(client: FakeClient | undefined): string[] {
  return client?.queries.map((query) => query.sql) ?? []
}

async function connected(): Promise<EngineSession> {
  return postgresEngine.connect(pgRequest())
}

beforeEach(() => {
  pg.reset()
  answerPids()
})

describe('the PostgreSQL dialect', () => {
  it('should read SQL with the lexical rules of PostgreSQL', () => {
    expect(postgresEngine.dialect.lexical).toStrictEqual(POSTGRES_LEXICAL)
    expect({ ...postgresEngine.dialect, keywords: [] }).toStrictEqual({
      ...EXPECTED_DIALECT,
      keywords: [],
    })
    expect(postgresEngine.dialect.keywords).toContain('ILIKE')
  })
})

describe('useScope', () => {
  it('should run later statements in another database, with the schema first in the search path', async () => {
    const sut = await connected()

    await sut.useScope({ database: 'crm', schema: 'sales' })
    const execution = sut.execute(queryRequest({ sql: 'SELECT 1' }))
    await execution.cancel()

    const crm = pg.clients[1]
    expect(crm?.config).toMatchObject({ database: 'crm' })
    expect(sqlOf(crm)).toStrictEqual([
      'SELECT pg_backend_pid() AS pid',
      'SET search_path TO "sales", "public"',
    ])
    expect(crm?.cursors.map((cursor) => cursor.sql)).toStrictEqual(['SELECT 1'])
    expect(pg.clients[2]?.config).toMatchObject({ database: 'crm' })
    expect(pg.clients[2]?.queries).toStrictEqual([
      { sql: 'SELECT pg_cancel_backend($1)', values: [CRM_PID] },
    ])
  })

  it('should put public alone in the search path', async () => {
    const sut = await connected()

    await sut.useScope({ database: 'shop', schema: 'public' })

    expect(sqlOf(pg.clients[0]).at(-1)).toBe('SET search_path TO "public"')
    expect(pg.clients).toHaveLength(1)
  })

  it('should bring the default search path back without a schema, in the database of the session', async () => {
    const sut = await connected()

    await sut.useScope({ database: '', schema: '' })

    expect(sqlOf(pg.clients[0]).at(-1)).toBe('RESET search_path')
    expect(pg.clients).toHaveLength(1)
  })

  it('should quote the schema', async () => {
    const sut = await connected()

    await sut.useScope({ database: 'shop', schema: 'My "Schema"' })

    expect(sqlOf(pg.clients[0]).at(-1)).toBe('SET search_path TO "My ""Schema""", "public"')
  })

  it('should cancel with no backend when the server does not say which serves a database', async () => {
    pg.script.answer = (query) =>
      query.sql.includes('current_setting') ? { rows: [SESSION_INFO] } : { rows: [] }
    const sut = await connected()

    await sut.useScope({ database: 'crm', schema: '' })
    await sut.execute(queryRequest()).cancel()

    expect(pg.clients[2]?.queries).toStrictEqual([
      { sql: 'SELECT pg_cancel_backend($1)', values: [0] },
    ])
  })
})
