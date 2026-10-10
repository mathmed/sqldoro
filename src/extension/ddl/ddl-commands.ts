import * as vscode from 'vscode'

import { ObjectKind } from '../../core/engine/catalog.ts'
import type { Logger } from '../../core/platform.ts'
import { CommandId } from '../command-id.ts'
import { registerAll } from '../commands/command-context.ts'
import { isObjectNode, NodeKind } from '../tree/explorer-node.ts'
import { type DdlDocuments, ddlUri } from './ddl-documents.ts'

export interface DdlCommandContext {
  readonly ddl: DdlDocuments
  readonly log: Logger
}

export function registerDdlCommands(context: DdlCommandContext): vscode.Disposable[] {
  return registerAll(context, [{ id: CommandId.ShowDdl, action: 'Show DDL', run: showDdl }])
}

// From a table or view of the explorer: its definition in a read-only SQL document.
async function showDdl(context: DdlCommandContext, target: unknown): Promise<void> {
  if (!isObjectNode(target) || target.place === undefined) {
    void vscode.window.showInformationMessage(
      'Show DDL works on a table or a view of the Connections view.',
    )
    return
  }
  const kind = target.kind === NodeKind.View ? ObjectKind.View : ObjectKind.Table
  const uri = ddlUri({ connectionId: target.connectionId, object: target.place, kind })
  context.ddl.refresh(uri)
  const document = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(document, { preview: true })
}
