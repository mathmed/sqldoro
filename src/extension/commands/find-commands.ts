import * as vscode from 'vscode'

import type { ObjectRef } from '../../core/engine/catalog.ts'
import { CommandId, ContextKey } from '../command-id.ts'
import { NodeKind } from '../tree/explorer-node.ts'
import type { ConnectionObjects } from '../tree/table-index.ts'
import { type CommandContext, registerAll } from './command-context.ts'

// A table or view the quick pick of Go to Table offers.
interface TableItem extends vscode.QuickPickItem {
  readonly connectionId: string
  readonly objectKind: typeof NodeKind.Table | typeof NodeKind.View
  readonly place: ObjectRef
}

const NOTHING_CONNECTED =
  'Connect to a connection first: Go to Table lists the tables of the connected ones.'

// Finding a table as the name is typed: the explorer shows only the tables and views that hold the
// text, opened down to them (Find Table in Explorer); or a quick pick of every table of the
// connected connections that opens the one chosen (Go to Table).
export function registerFindCommands(context: CommandContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.FindTable, action: 'Find Table in Explorer', run: findTable },
    { id: CommandId.GoToTable, action: 'Go to Table', run: goToTable },
  ])
}

// The explorer follows what is typed; Enter keeps it (Clear Filter gives the tree back), Escape
// gives the tree back at once.
async function findTable(context: CommandContext): Promise<void> {
  const box = vscode.window.createInputBox()
  box.title = 'Find Table in Explorer'
  box.placeholder = 'Part of the name of a table or view'
  box.prompt = 'The explorer shows the tables and views of the connected connections that match.'
  box.value = context.explorer.find
  let isKept = false
  const { promise, resolve } = Promise.withResolvers<undefined>()
  box.onDidChangeValue((text) => {
    context.explorer.setFind(text)
  })
  box.onDidAccept(() => {
    isKept = true
    box.hide()
  })
  box.onDidHide(() => {
    void settleFind(context, isKept ? box.value : '').then(() => {
      box.dispose()
      resolve(undefined)
    })
  })
  box.show()
  return promise
}

async function settleFind(context: CommandContext, text: string): Promise<void> {
  context.explorer.setFind(text)
  const { find } = context.explorer
  context.setViewMessage(find === '' ? '' : `Tables and views matching "${find}"`)
  await vscode.commands.executeCommand('setContext', ContextKey.IsFiltered, find !== '')
}

async function goToTable(context: CommandContext): Promise<void> {
  const pick = vscode.window.createQuickPick<TableItem>()
  pick.title = 'Go to Table'
  pick.placeholder = 'Type part of the name of a table or view'
  pick.matchOnDescription = true
  pick.busy = true
  const { promise, resolve } = Promise.withResolvers<undefined>()
  pick.onDidAccept(() => {
    const [chosen] = pick.selectedItems
    pick.hide()
    if (chosen !== undefined) {
      void vscode.commands.executeCommand(CommandId.OpenTableData, nodeOf(chosen))
    }
  })
  pick.onDidHide(() => {
    pick.dispose()
    resolve(undefined)
  })
  pick.show()
  pick.items = itemsOf(await context.index.objects())
  pick.busy = false
  if (pick.items.length === 0) {
    pick.placeholder = NOTHING_CONNECTED
  }
  return promise
}

// What the explorer gives Open Table Data: the table or view, and its connection.
function nodeOf(item: TableItem): unknown {
  return { kind: item.objectKind, connectionId: item.connectionId, place: item.place }
}

function itemsOf(found: readonly ConnectionObjects[]): TableItem[] {
  return found.flatMap(({ connection, scopes }) =>
    scopes.flatMap(({ scope, tables, views }) => {
      const where =
        scope.schema === scope.database ? scope.database : `${scope.database}.${scope.schema}`
      const description = `${connection.name} · ${where}`
      const item = (name: string, kind: TableItem['objectKind']): TableItem => ({
        label: `$(${kind === NodeKind.Table ? 'table' : 'eye'}) ${name}`,
        description,
        connectionId: connection.id,
        objectKind: kind,
        place: { ...scope, name },
      })
      return [
        ...tables.map((name) => item(name, NodeKind.Table)),
        ...views.map((name) => item(name, NodeKind.View)),
      ]
    }),
  )
}
