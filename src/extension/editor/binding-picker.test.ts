import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSession } from '../../../test/fakes/engine.ts'
import { answerQuickPicks } from '../../../test/support/prompts.ts'
import { CRM, MYSQL_ENGINE, POSTGRES_ENGINE, SHOP } from '../../../test/support/query.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { pickBinding } from './binding-picker.ts'

const listDatabases = vi.fn<EngineSession['listDatabases']>(async () =>
  Promise.resolve([{ name: 'analytics' }, { name: 'shop' }]),
)
const session = fakeSession({
  listDatabases,
  listSchemas: async () => Promise.resolve([{ name: 'audit' }, { name: 'public' }]),
})
const connect = vi.fn(async () =>
  Promise.resolve({ engine: POSTGRES_ENGINE, engineSession: session, close: vi.fn() }),
)

async function pick(
  connections: readonly ConnectionConfig[] = [SHOP, CRM],
): ReturnType<typeof pickBinding> {
  return pickBinding({
    connections: () => connections,
    connect,
    engines: new EngineRegistry([POSTGRES_ENGINE, MYSQL_ENGINE]),
  })
}

beforeEach(() => {
  resetVscode()
  window.showQuickPick.mockReset()
  window.showInformationMessage.mockReset()
  connect.mockClear()
  listDatabases.mockClear()
})

describe('pickBinding', () => {
  it('should pick the connection, its database and its schema, the defaults first', async () => {
    answerQuickPicks('Shop', 'shop', 'public')

    await expect(pick()).resolves.toStrictEqual({
      connectionId: 'shop',
      database: 'shop',
      schema: 'public',
    })

    expect(connect).toHaveBeenCalledWith(SHOP)
    expect(listDatabases).toHaveBeenCalledExactlyOnceWith(CatalogDetail.Names)
    const [databases, schemas] = window.showQuickPick.mock.calls
      .slice(1)
      .map(([items]) => (items as { label: string }[]).map((item) => item.label))
    expect(databases).toStrictEqual(['shop', 'analytics'])
    expect(schemas).toStrictEqual(['public', 'audit'])
  })

  it('should not ask for a schema in MySQL', async () => {
    answerQuickPicks('CRM', 'analytics')

    await expect(pick()).resolves.toStrictEqual({
      connectionId: 'crm',
      database: 'analytics',
      schema: '',
    })
  })

  it('should keep the order of databases that do not hold the default', async () => {
    answerQuickPicks('Shop', 'analytics', 'audit')

    await pick([{ ...SHOP, database: 'other' }])

    expect(
      (window.showQuickPick.mock.calls[1]?.[0] as { label: string }[]).map((item) => item.label),
    ).toStrictEqual(['analytics', 'shop'])
  })

  it.each([
    ['the connection', [undefined]],
    ['the database', ['Shop', undefined]],
    ['the schema', ['Shop', 'shop', undefined]],
  ])('should pick nothing when %s is dismissed', async (...[, answers]) => {
    answerQuickPicks(...answers)

    await expect(pick()).resolves.toBeUndefined()
  })

  it('should say there is no connection yet', async () => {
    await expect(pick([])).resolves.toBeUndefined()

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'There is no connection yet: add one first.',
    )
  })
})
