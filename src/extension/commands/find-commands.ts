import * as vscode from 'vscode'

import type { ObjectRef } from '../../core/engine/catalog.ts'
import { matchesFilter } from '../../core/text/filter.ts'
import { compareMatches, matchName } from '../../core/text/fuzzy.ts'
import { CommandId } from '../command-id.ts'
import { NodeKind } from '../tree/explorer-node.ts'
import type { ConnectionObjects } from '../tree/table-index.ts'
import { type CommandContext, registerAll } from './command-context.ts'
import { TableFinder } from './table-finder.ts'

// A table or view the quick pick of Go to Table offers. It filters them itself, with the matcher of
// Find Table in Explorer: each one is always shown once it matches.
interface TableItem extends vscode.QuickPickItem {
  readonly name: string
  readonly description: string
  readonly connectionId: string
  readonly objectKind: typeof NodeKind.Table | typeof NodeKind.View
  readonly place: ObjectRef
}

const NOTHING_CONNECTED =
  'Connect to a connection first: Go to Table lists the tables of the connected ones.'

// Finding a table as the name is typed: an input box whose text shows in the explorer only the
// tables and views whose name matches it, opened down to them (Find Table in Explorer); or a quick
// pick of every table of the connected connections that opens the one chosen (Go to Table).
export function registerFindCommands(context: CommandContext): vscode.Disposable[] {
  const finder = new TableFinder(context)
  return registerAll(context, [
    { id: CommandId.FindTable, action: 'Find Table in Explorer', run: async () => finder.find() },
    { id: CommandId.GoToTable, action: 'Go to Table', run: goToTable },
  ])
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
  const all = itemsOf(await context.index.objects())
  pick.onDidChangeValue((text) => {
    pick.items = matching(all, text)
  })
  pick.items = matching(all, pick.value)
  pick.busy = false
  if (all.length === 0) {
    pick.placeholder = NOTHING_CONNECTED
  }
  return promise
}

// The tables and views whose name matches the text, the best first, then those whose connection or
// database holds it.
function matching(items: readonly TableItem[], text: string): TableItem[] {
  if (text.trim() === '') {
    return [...items]
  }
  const named = items
    .flatMap((item) => {
      const match = matchName(item.name, text)
      return match === undefined ? [] : [{ item, match }]
    })
    .toSorted((first, second) => compareMatches(first.match, second.match))
    .map(({ item }) => item)
  const shown = new Set(named)
  return [
    ...named,
    ...items.filter((item) => !shown.has(item) && matchesFilter(item.description, text)),
  ]
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
        name,
        description,
        alwaysShow: true,
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
