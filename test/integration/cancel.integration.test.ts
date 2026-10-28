// The cancel of a statement on real servers when the network stops answering, through a proxy that
// stops forwarding: the server never hears the kill, or stops the statement without the session
// hearing it. Either way the wait ends by the deadline, as cancelled, both connections close, and
// the session closes at once.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { CANCEL_TIMEOUT_MS } from '../../src/core/engine/cancellation.ts'
import type { Engine, EngineSession } from '../../src/core/engine/engine.ts'
import type { QueryExecution } from '../../src/core/engine/query.ts'
import { createEngineRegistry } from '../../src/extension/factories/engines.ts'
import { queryRequest } from '../fakes/query-request.ts'
import { NOT_STOPPED, REQUEST_LATE } from '../support/cancel.ts'
import { type StallProxy, startStallProxy } from '../support/stall-proxy.ts'
import { connectRequest, type DatabaseServer, MYSQL, POSTGRES, waitUntilReady } from './servers.ts'

// The wait ends a little after the deadline: the connections close, the result settles.
const MARGIN_MS = 1500
// Long enough for the statement to reach the server before the network stops.
const STARTED_MS = 300

interface Case {
  readonly name: string
  readonly engineId: string
  readonly server: DatabaseServer
  readonly sleep: string
}

interface Sleeping {
  readonly session: EngineSession
  readonly execution: QueryExecution
}

const CASES: readonly Case[] = [
  { name: 'MySQL', engineId: 'mysql', server: MYSQL, sleep: 'SELECT SLEEP(20) AS slept' },
  { name: 'PostgreSQL', engineId: 'postgres', server: POSTGRES, sleep: 'SELECT pg_sleep(20)' },
]

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

describe.each(CASES)('a cancel on a real $name server when the network stops', (target) => {
  let engine: Engine
  let proxy: StallProxy | undefined

  // A statement that sleeps on the server, on a session through the proxy.
  async function sleeping(onUnexpectedClose: (error: Error) => void): Promise<Sleeping> {
    proxy = await startStallProxy(target.server.endpoint)
    const session = await engine.connect(
      connectRequest(target.server, { endpoint: proxy.endpoint, onUnexpectedClose }),
    )
    const execution = session.execute(queryRequest({ sql: target.sleep, maxRows: 1 }))
    await delay(STARTED_MS)
    return { session, execution }
  }

  beforeAll(async () => {
    engine = createEngineRegistry().get(target.engineId)
    await waitUntilReady(async () => {
      await (await engine.connect(connectRequest(target.server))).close()
    })
  })

  afterEach(async () => {
    await proxy?.close()
    proxy = undefined
  })

  it('should end the wait by the deadline when the kill never reaches the server, and close both connections', async () => {
    const onUnexpectedClose = vi.fn()
    const { session, execution } = await sleeping(onUnexpectedClose)
    proxy?.stallAll()
    const started = Date.now()

    await execution.cancel()

    expect(Date.now() - started).toBeLessThan(CANCEL_TIMEOUT_MS + MARGIN_MS)
    await expect(execution.result).rejects.toMatchObject({
      name: 'QueryCancelledError',
      hasClosedConnection: true,
    })
    expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(new Error(REQUEST_LATE))
    await vi.waitFor(() => {
      expect(proxy?.openClients()).toBe(0)
    })
    await session.close()
  })

  it('should end the wait by the deadline when the session never hears that the server stopped the statement', async () => {
    const onUnexpectedClose = vi.fn()
    const { session, execution } = await sleeping(onUnexpectedClose)
    proxy?.stallOpen()
    const started = Date.now()

    await execution.cancel()

    expect(Date.now() - started).toBeLessThan(CANCEL_TIMEOUT_MS + MARGIN_MS)
    await expect(execution.result).rejects.toMatchObject({
      name: 'QueryCancelledError',
      hasClosedConnection: true,
    })
    expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(new Error(NOT_STOPPED))
    await vi.waitFor(() => {
      expect(proxy?.openClients()).toBe(0)
    })
    await session.close()
  })
})
