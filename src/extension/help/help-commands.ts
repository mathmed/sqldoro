import * as vscode from 'vscode'

import type { Logger } from '../../core/platform.ts'
import { CommandId } from '../command-id.ts'
import { registerAll } from '../commands/command-context.ts'

export interface HelpContext {
  // The id VS Code knows the extension by (publisher.name): the walkthrough is named after it.
  readonly extensionId: string
  readonly extensionUri: vscode.Uri
  readonly packageJson: unknown
  readonly log: Logger
}

// contributes.walkthroughs in package.json, and the page of its safety step.
const WALKTHROUGH = 'sqldoro.gettingStarted'
const SAFETY_PAGE = ['media', 'walkthrough', 'safety.md']
const OPEN_WALKTHROUGH = 'workbench.action.openWalkthrough'
const MARKDOWN_PREVIEW = 'markdown.showPreview'
const READ_SAFETY_MODEL = 'Read the Safety Model'
const GET_STARTED = 'Get Started'
const ABOUT = [
  'A MySQL and PostgreSQL client for VS Code. Open source (MIT), with no telemetry: it talks only to the databases you configure.',
  'Every statement goes through one guard first. Read-only connections refuse anything that may write, and their database sessions are read-only too; an UPDATE or DELETE of every row waits for its table name; production waits for the connection name; queries that read get an automatic LIMIT.',
  'The guard is best effort and cannot see inside procedures, triggers or functions: the permissions of the database user are the real guarantee. Connect with the least privilege the work needs.',
].join('\n\n')

export function registerHelpCommands(context: HelpContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.GettingStarted, action: 'Get Started', run: openWalkthrough },
    { id: CommandId.About, action: 'About sqldoro', run: showAbout },
  ])
}

async function openWalkthrough(context: HelpContext): Promise<void> {
  await vscode.commands.executeCommand(OPEN_WALKTHROUGH, `${context.extensionId}#${WALKTHROUGH}`)
}

async function showAbout(context: HelpContext): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    `sqldoro ${versionOf(context.packageJson)}`,
    { modal: true, detail: ABOUT },
    READ_SAFETY_MODEL,
    GET_STARTED,
  )
  if (choice === READ_SAFETY_MODEL) {
    await openSafetyModel(context)
  }
  if (choice === GET_STARTED) {
    await openWalkthrough(context)
  }
}

// The safety model in the Markdown preview, or as text when the Markdown extension is disabled.
async function openSafetyModel(context: HelpContext): Promise<void> {
  const page = vscode.Uri.joinPath(context.extensionUri, ...SAFETY_PAGE)
  try {
    await vscode.commands.executeCommand(MARKDOWN_PREVIEW, page)
  } catch (error) {
    context.log.debug(`No Markdown preview, the safety model opens as text: ${String(error)}`)
    await vscode.window.showTextDocument(page, { preview: true })
  }
}

// The version of the manifest VS Code read (extension.packageJSON, typed any by the API).
export function versionOf(packageJson: unknown): string {
  if (typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson) {
    return typeof packageJson.version === 'string' ? packageJson.version : ''
  }
  return ''
}
