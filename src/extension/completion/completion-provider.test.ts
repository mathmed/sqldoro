import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { fakeSession } from '../../../test/fakes/engine.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import {
  MYSQL_ENGINE,
  POSTGRES_ENGINE,
  type QueryHarness,
  queryHarness,
  SHOP_BINDING,
  sqlEditor,
} from '../../../test/support/query.ts'
import { type CompletionList, Position, resetVscode } from '../../../test/vscode.ts'
import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { SqlCompletionProvider } from './completion-provider.ts'
import { SchemaCache } from './schema-cache.ts'

const NOT_CANCELLED = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: vi.fn() }),
}

let harness: QueryHarness
let session: EngineSession | undefined

function provider(): SqlCompletionProvider {
  return new SqlCompletionProvider({
    bindings: harness.bindings,
    connections: (id) => harness.connections.get(id),
    engines: new EngineRegistry([POSTGRES_ENGINE, MYSQL_ENGINE]),
    session: () => session,
    cache: new SchemaCache(recordingLogger()),
  })
}

async function complete(
  text: string,
  token: unknown = NOT_CANCELLED,
): Promise<CompletionList | undefined> {
  const editor = await sqlEditor(harness, text.replace('|', ''), SHOP_BINDING)
  const position = editor.document.positionAt(text.indexOf('|'))
  return (await provider().provideCompletionItems(
    editor.document as unknown as vscode.TextDocument,
    position as unknown as vscode.Position,
    token as vscode.CancellationToken,
  )) as CompletionList | undefined
}

function itemNamed(
  list: CompletionList | undefined,
  label: string,
): CompletionList['items'][number] {
  const item = list?.items.find((candidate) => candidate.label === label)
  if (item === undefined) {
    throw new Error(`no completion ${label}`)
  }
  return item
}

beforeEach(() => {
  resetVscode()
  harness = queryHarness()
  session = fakeSession({
    listTables: async () => Promise.resolve([{ name: 'orders' }, { name: 'Order Lines' }]),
    listColumns: async () =>
      Promise.resolve([
        {
          name: 'id',
          dataType: 'bigint',
          isNullable: false,
          defaultValue: undefined,
          isPrimaryKey: true,
        },
      ]),
  })
})

describe('SqlCompletionProvider', () => {
  it('should offer the tables of the schema of the editor, quoted where needed', async () => {
    const list = await complete('SELECT * FROM o|')

    const orders = itemNamed(list, 'Order Lines')
    expect(orders).toMatchObject({
      kind: 21,
      insertText: '"Order Lines"',
      detail: 'table in sales',
    })
    expect(orders.range).toMatchObject({ start: new Position(0, 14), end: new Position(0, 15) })
    expect(list).toMatchObject({ isIncomplete: false })
  })

  it('should offer the columns of an alias', async () => {
    const list = await complete('SELECT o.| FROM orders o')

    expect(list?.items.map((item) => [item.label, item.kind])).toStrictEqual([['id', 4]])
  })

  it('should offer keywords only without the session of the explorer', async () => {
    session = undefined

    const list = await complete('SELECT * FROM |')

    expect(list?.items.every((item) => item.kind === 13)).toBe(true)
  })

  it('should offer nothing for an editor without a connection', async () => {
    const editor = await sqlEditor(harness, 'SEL', null)

    await expect(
      provider().provideCompletionItems(
        editor.document as unknown as vscode.TextDocument,
        new Position(0, 3) as unknown as vscode.Position,
        NOT_CANCELLED as unknown as vscode.CancellationToken,
      ),
    ).resolves.toBeUndefined()
  })

  it('should stop waiting for the catalog when the request is cancelled, and ask to be asked again', async () => {
    session = fakeSession({ listTables: async () => new Promise<never>(() => undefined) })
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: (listener: () => void) => {
        queueMicrotask(listener)
        return { dispose: vi.fn() }
      },
    }

    const list = await complete('SELECT * FROM |', token)

    expect(list?.isIncomplete).toBe(true)
  })

  it('should stop waiting for the catalog after its budget', async () => {
    vi.useFakeTimers()
    session = fakeSession({ listTables: async () => new Promise<never>(() => undefined) })

    const pending = complete('SELECT * FROM |')
    await vi.advanceTimersByTimeAsync(750)

    await expect(pending).resolves.toMatchObject({ isIncomplete: true })
    vi.useRealTimers()
  })
})
