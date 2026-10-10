import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { historyEntry } from '../../../test/fixtures/history.ts'
import { CRM, SHOP } from '../../../test/support/query.ts'
import { type MarkdownString, ThemeIcon } from '../../../test/vscode.ts'
import { RunOutcome } from '../../core/history/history.ts'
import { HistoryStore } from './history-store.ts'
import { entryLabel, entryTime, HistoryNodeKind, HistoryView } from './history-view.ts'

let store: HistoryStore
let sut: HistoryView

beforeEach(async () => {
  store = new HistoryStore(new FakeMemento(), recordingLogger(), () => 10)
  sut = new HistoryView(store, () => [SHOP, CRM])
  await store.add(historyEntry('a'))
  await store.add(
    historyEntry('b', {
      sql: `SELECT\n  ${'x'.repeat(90)}`,
      outcome: RunOutcome.Failed,
      message: 'boom',
      schema: 'shop',
    }),
  )
})

describe('HistoryView', () => {
  it('should list the connections that ran statements, then their statements newest first', () => {
    const [shop, ...others] = sut.getChildren()

    expect(others).toStrictEqual([])
    expect(shop).toStrictEqual({ kind: HistoryNodeKind.Connection, connectionId: 'shop' })
    expect(
      sut
        .getChildren(shop)
        .map((node) => (node.kind === HistoryNodeKind.Entry ? node.entry.id : '')),
    ).toStrictEqual(['b', 'a'])
    expect(
      sut.getChildren({ kind: HistoryNodeKind.Entry, entry: historyEntry('a') }),
    ).toStrictEqual([])
  })

  it('should show a connection with its name and its count', () => {
    expect(
      sut.getTreeItem({ kind: HistoryNodeKind.Connection, connectionId: 'shop' }),
    ).toMatchObject({
      label: 'Shop',
      description: '2 statements',
      collapsibleState: 1,
      contextValue: 'historyConnection',
      iconPath: new ThemeIcon('database'),
    })
    expect(sut.getTreeItem({ kind: HistoryNodeKind.Connection, connectionId: 'gone' }).label).toBe(
      'gone',
    )
  })

  it('should show a statement on one line with its time, outcome and command', () => {
    const entry = historyEntry('b', {
      sql: `SELECT\n  ${'x'.repeat(90)}`,
      outcome: RunOutcome.Failed,
      message: 'boom',
    })

    const item = sut.getTreeItem({ kind: HistoryNodeKind.Entry, entry })

    expect(item).toMatchObject({
      label: `SELECT ${'x'.repeat(72)}…`,
      description: '2026-10-10 03:04 UTC',
      contextValue: 'historyEntry',
      iconPath: new ThemeIcon('error'),
      command: {
        command: 'sqldoro.openHistoryEntry',
        arguments: [{ kind: 'historyEntry', entry }],
      },
    })
    expect((item.tooltip as MarkdownString).value).toBe(
      `\n\`\`\`sql\n${entry.sql}\n\`\`\`\nfailed in 12 ms on shop.sales, 2026-10-10 03:04 UTC\nboom`,
    )
  })

  it('should name the database alone when the schema is the database or empty', () => {
    const tooltip = sut.getTreeItem({
      kind: HistoryNodeKind.Entry,
      entry: historyEntry('c', { schema: '' }),
    }).tooltip as MarkdownString

    expect(tooltip.value).toContain('succeeded in 12 ms on shop, ')
    expect(
      sut.getTreeItem({
        kind: HistoryNodeKind.Entry,
        entry: historyEntry('d', { outcome: RunOutcome.Cancelled }),
      }).iconPath,
    ).toStrictEqual(new ThemeIcon('circle-slash'))
  })

  it('should refresh when the history changes or when asked, until disposed', async () => {
    const changes = vi.fn()
    sut.onDidChangeTreeData(changes)

    await store.add(historyEntry('e'))
    sut.refresh()
    sut.dispose()
    await store.add(historyEntry('f'))

    expect(changes).toHaveBeenCalledTimes(2)
  })
})

describe('entryLabel and entryTime', () => {
  it('should keep short statements as they are and read the minutes of the time', () => {
    expect(entryLabel(historyEntry('a', { sql: ' SELECT  1 ' }))).toBe('SELECT 1')
    expect(entryTime(historyEntry('a'))).toBe('2026-10-10 03:04 UTC')
  })
})
