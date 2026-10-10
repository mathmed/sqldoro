import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type FakeClient, pg, pgRequest } from '../../../test/fakes/pg.ts'
import type { ConnectRequest, EngineSession } from '../../core/engine/engine.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
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
const READ_ONLY = 'SET default_transaction_read_only = on'

// Every statement answers, except the one given on the database given, which fails.
function answer(failing = { sql: '', database: '' }): void {
  pg.script.answer = (query, client) => {
    if (query.sql === failing.sql && client.config.database === failing.database) {
      return { error: new Error('permission denied') }
    }
    return query.sql.includes('pg_backend_pid()') ? { rows: [SESSION_INFO] } : { rows: [] }
  }
}

function sqlOf(client: FakeClient | undefined): string[] {
  return client?.queries.map((query) => query.sql) ?? []
}

async function connected(changes: Partial<ConnectRequest> = {}): Promise<EngineSession> {
  return postgresEngine.connect(pgRequest(changes))
}

beforeEach(() => {
  pg.reset()
  answer()
})

describe('postgresEngine on a read-only connection', () => {
  it('should make every connection of the session refuse writes, other databases too', async () => {
    const sut = await connected({ isReadOnly: true })

    await sut.useScope({ database: 'crm', schema: '' })

    expect(sqlOf(pg.clients[0])[0]).toBe(READ_ONLY)
    expect(sqlOf(pg.clients[1])).toStrictEqual([
      READ_ONLY,
      'SELECT pg_backend_pid() AS pid',
      'RESET search_path',
    ])
  })

  it('should leave the connections of a writable session as the server opens them', async () => {
    const sut = await connected({ isReadOnly: false })

    await sut.useScope({ database: 'crm', schema: '' })

    expect(pg.clients.flatMap(sqlOf)).not.toContain(READ_ONLY)
  })

  it('should not use a connection that could not be made read-only', async () => {
    answer({ sql: READ_ONLY, database: 'shop' })
    await expect(connected({ isReadOnly: true })).rejects.toThrow('permission denied')
    expect(pg.clients[0]?.isEnded).toBe(true)

    answer({ sql: READ_ONLY, database: 'crm' })
    const sut = await connected({ isReadOnly: true })
    await expect(sut.useScope({ database: 'crm', schema: '' })).rejects.toThrow('permission denied')
    expect(pg.clients.at(-1)?.isEnded).toBe(true)
  })
})

describe('postgresEngine.transactionStatus', () => {
  it.each([
    ['I', TransactionStatus.Idle],
    ['T', TransactionStatus.Open],
    ['E', TransactionStatus.Failed],
    ['?', TransactionStatus.Unknown],
    [null, TransactionStatus.Unknown],
  ])('should read %s once the statements before have ended', async (status, expected) => {
    const sut = await connected()
    pg.script.transactionStatus = status

    await expect(sut.transactionStatus()).resolves.toBe(expected)
    expect(sqlOf(pg.clients[0]).at(-1)).toBe('')
  })

  it('should ask the connection the statements run on', async () => {
    const sut = await connected()
    await sut.useScope({ database: 'crm', schema: '' })

    await sut.transactionStatus()

    expect(sqlOf(pg.clients[1]).at(-1)).toBe('')
  })
})
