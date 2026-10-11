import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { type QueryHarness, queryHarness, sqlEditor } from '../../../test/support/query.ts'
import { commands, documents, resetVscode } from '../../../test/vscode.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { CommandId } from '../command-id.ts'
import { actionsOf, type PanelWiring } from './panel-wiring.ts'

let harness: QueryHarness
let wiring: PanelWiring

function tabOf(): ResultSet {
  return new ResultSet({
    id: 'tab-1',
    sql: 'SELECT 1',
    values: [],
    kind: TabKind.Rows,
    canServerView: true,
    canRefresh: false,
  })
}

beforeEach(() => {
  resetVscode()
  harness = queryHarness()
  wiring = {
    runner: harness.runner,
    transactions: harness.transactions,
    editorSessions: harness.editorSessions,
    tables: harness.tables,
    policy: () => ({ productionEnvironments: new Set(['prod']) }),
  }
})

describe('actionsOf an editor', () => {
  it('should leave reading again, WHERE, layouts and opening in an editor to table panels', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    const sut = actionsOf(editor.document.uri as unknown as vscode.Uri, wiring)

    await sut.refresh(tabOf())
    await sut.filterTable(tabOf(), 'id = 1')
    await sut.saveLayout(tabOf())
    await sut.openInEditor(tabOf())

    expect(harness.engine.requests).toStrictEqual([])
    expect(documents).toHaveLength(1)
  })

  it('should ask to allow writes on the connection of the editor, if it has one', async () => {
    const allowWrites = vi.fn()
    commands.registerCommand(CommandId.AllowWrites, allowWrites)
    const bound = await sqlEditor(harness, 'SELECT 1')
    const unbound = await sqlEditor(harness, 'SELECT 2', null)

    await actionsOf(unbound.document.uri as unknown as vscode.Uri, wiring).allowWrites()
    await actionsOf(bound.document.uri as unknown as vscode.Uri, wiring).allowWrites()

    expect(allowWrites).toHaveBeenCalledExactlyOnceWith('shop')
  })
})
