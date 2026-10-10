import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { builtInCalls, disableBuiltIn, resetVscode, window } from '../../../test/vscode.ts'
import { CommandId } from '../command-id.ts'
import { registerHelpCommands, versionOf } from './help-commands.ts'

// The repository holds the pages the commands open, as the installed extension does.
const ROOT = vscode.Uri.file(fileURLToPath(new URL('../../..', import.meta.url)))
const SAFETY_PAGE = vscode.Uri.joinPath(ROOT, 'media', 'walkthrough', 'safety.md')

let log: ReturnType<typeof recordingLogger>

beforeEach(() => {
  resetVscode()
  window.showInformationMessage.mockReset()
  log = recordingLogger()
  registerHelpCommands({
    extensionId: 'mathmed.sqldoro',
    extensionUri: ROOT,
    packageJson: { version: '0.1.0' },
    log,
  })
})

describe('Get Started', () => {
  it('should open the walkthrough of the extension', async () => {
    await vscode.commands.executeCommand(CommandId.GettingStarted)

    expect(builtInCalls).toStrictEqual([
      {
        command: 'workbench.action.openWalkthrough',
        args: ['mathmed.sqldoro#sqldoro.gettingStarted'],
      },
    ])
  })
})

describe('About sqldoro and Its Safety Model', () => {
  it('should tell the version and the safety model, including what it cannot do', async () => {
    await vscode.commands.executeCommand(CommandId.About)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'sqldoro 0.1.0',
      {
        modal: true,
        detail: expect.stringMatching(
          /no telemetry[\s\S]*the permissions of the database user are the real guarantee/u,
        ) as unknown,
      },
      'Read the Safety Model',
      'Get Started',
    )
    expect(builtInCalls).toStrictEqual([])
  })

  it('should open the safety model in the Markdown preview', async () => {
    window.showInformationMessage.mockResolvedValue('Read the Safety Model')

    await vscode.commands.executeCommand(CommandId.About)

    expect(builtInCalls).toStrictEqual([{ command: 'markdown.showPreview', args: [SAFETY_PAGE] }])
  })

  it('should open the safety model as text when there is no Markdown preview', async () => {
    window.showInformationMessage.mockResolvedValue('Read the Safety Model')
    disableBuiltIn('markdown.showPreview')

    await vscode.commands.executeCommand(CommandId.About)

    expect(window.activeTextEditor?.document.getText()).toContain('# The safety model')
    expect(log.debug).toHaveBeenCalledWith(
      "No Markdown preview, the safety model opens as text: Error: command 'markdown.showPreview' not found",
    )
  })

  it('should open the walkthrough from the about box', async () => {
    window.showInformationMessage.mockResolvedValue('Get Started')

    await vscode.commands.executeCommand(CommandId.About)

    expect(builtInCalls.map((call) => call.command)).toStrictEqual([
      'workbench.action.openWalkthrough',
    ])
  })
})

describe('versionOf', () => {
  it('should read the version of the manifest, or nothing from what is not one', () => {
    expect(versionOf({ version: '1.2.3' })).toBe('1.2.3')
    expect(versionOf({ version: 3 })).toBe('')
    expect(versionOf({})).toBe('')
    expect(versionOf(null)).toBe('')
    expect(versionOf('1.2.3')).toBe('')
  })
})
