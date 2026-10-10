import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { fakeSession } from '../../../test/fakes/engine.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { CommandId } from '../command-id.ts'
import { registerDdlCommands } from './ddl-commands.ts'
import { DDL_SCHEME, DdlDocuments } from './ddl-documents.ts'

const objectDdl = vi.fn(async () => Promise.resolve('CREATE VIEW totals AS SELECT 1;'))
let disposables: vscode.Disposable[]

beforeEach(() => {
  resetVscode()
  window.showInformationMessage.mockReset()
  objectDdl.mockClear()
  const ddl = new DdlDocuments(() => fakeSession({ objectDdl }))
  disposables = [
    vscode.workspace.registerTextDocumentContentProvider(DDL_SCHEME, ddl),
    ...registerDdlCommands({ ddl, log: recordingLogger() }),
  ]
})

afterEach(() => {
  for (const disposable of disposables) {
    disposable.dispose()
  }
})

describe('Show DDL', () => {
  it('should open the definition of a view of the explorer in a SQL document', async () => {
    await vscode.commands.executeCommand(CommandId.ShowDdl, {
      kind: 'view',
      connectionId: 'shop',
      place: { database: 'shop', schema: 'sales', name: 'totals' },
    })

    expect(window.activeTextEditor?.document.getText()).toBe('CREATE VIEW totals AS SELECT 1;\n')
    expect(window.activeTextEditor?.document.languageId).toBe('sql')
    expect(objectDdl).toHaveBeenCalledWith(
      { database: 'shop', schema: 'sales', name: 'totals' },
      'view',
    )
  })

  it('should read a table as a table', async () => {
    await vscode.commands.executeCommand(CommandId.ShowDdl, {
      kind: 'table',
      connectionId: 'shop',
      place: { database: 'shop', schema: 'sales', name: 'orders' },
    })

    expect(objectDdl).toHaveBeenCalledWith(
      { database: 'shop', schema: 'sales', name: 'orders' },
      'table',
    )
  })

  it.each([
    undefined,
    { kind: 'column', connectionId: 'shop' },
    { kind: 'table', connectionId: 'shop' },
  ])('should explain that it works on tables and views for %j', async (target) => {
    await vscode.commands.executeCommand(CommandId.ShowDdl, target)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Show DDL works on a table or a view of the Connections view.',
    )
    expect(objectDdl).not.toHaveBeenCalled()
  })
})
