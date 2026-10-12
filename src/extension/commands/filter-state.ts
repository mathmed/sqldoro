import * as vscode from 'vscode'

import { ContextKey } from '../command-id.ts'
import type { CommandContext } from './command-context.ts'

// What the explorer is filtered by shows above it, and Clear Filter shows in its title bar while
// it is. A text being found hides the tables the filter would show, so it is the one named.
export async function showFilterState(
  context: Pick<CommandContext, 'explorer' | 'setViewMessage'>,
): Promise<void> {
  const { filter, find } = context.explorer
  const applied = find === '' ? filter : find
  context.setViewMessage(applied === '' ? '' : `Tables and views matching "${applied}"`)
  await vscode.commands.executeCommand('setContext', ContextKey.IsFiltered, applied !== '')
}
