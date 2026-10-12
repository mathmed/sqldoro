import * as vscode from 'vscode'

import { describeError } from '../../core/text/errors.ts'
import { CommandId, ContextKey } from '../command-id.ts'
import { askText } from '../form/prompts.ts'
import type { ExplorerNode } from '../tree/explorer-node.ts'
import { type CommandContext, connectionFrom, registerAll } from './command-context.ts'

export function registerExplorerCommands(context: CommandContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.Connect, action: 'Connect', run: connect },
    { id: CommandId.Disconnect, action: 'Disconnect', run: disconnect },
    { id: CommandId.Refresh, action: 'Refresh', run: refresh },
    { id: CommandId.Filter, action: 'Filter', run: filter },
    { id: CommandId.ClearFilter, action: 'Clear Filter', run: clearFilter },
  ])
}

async function connect(context: CommandContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Connect')
  if (connection === undefined) {
    return
  }
  try {
    await context.sessions.connect(connection)
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Could not connect to "${connection.name}": ${describeError(error)}`,
    )
  }
}

async function disconnect(context: CommandContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Disconnect')
  if (connection !== undefined) {
    await context.sessions.disconnect(connection.id)
  }
}

// From a node, refreshes that node; from the view title or the Command Palette, everything.
async function refresh(context: CommandContext, target: unknown): Promise<void> {
  context.explorer.refresh(isNode(target) ? target : undefined)
  return Promise.resolve()
}

async function filter(context: CommandContext): Promise<void> {
  const text = await askText({
    title: 'Filter Tables and Views',
    prompt: 'Show only the tables and views whose name contains this text',
    value: context.explorer.filter,
    placeHolder: 'Part of a name; empty shows everything',
  })
  if (text !== undefined) {
    await applyFilter(context, text)
  }
}

// Clears the filter and the text of the search box.
async function clearFilter(context: CommandContext): Promise<void> {
  context.explorer.setFind('')
  await applyFilter(context, '')
}

async function applyFilter(context: CommandContext, text: string): Promise<void> {
  context.explorer.setFilter(text)
  const { filter: applied } = context.explorer
  context.setViewMessage(applied === '' ? '' : `Tables and views matching "${applied}"`)
  await vscode.commands.executeCommand('setContext', ContextKey.IsFiltered, applied !== '')
}

function isNode(value: unknown): value is ExplorerNode {
  return typeof value === 'object' && value !== null && 'id' in value && 'treeItem' in value
}
