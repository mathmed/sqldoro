// Runs inside a real VS Code (Extension Development Host) launched by scripts/smoke.ts. Every line
// starting with `>> ` is read by the smoke analyzer of the Quality Report.
import * as vscode from 'vscode'

import manifest from '../../package.json' with { type: 'json' }
import { CommandId, SQL_LANGUAGE } from '../../src/extension/command-id.ts'

const EXTENSION_ID = `${manifest.publisher}.${manifest.name}`
const CONTRIBUTED_COMMANDS = manifest.contributes.commands.map(({ command }) => command)
const CONTRIBUTED_VIEWS = Object.values(manifest.contributes.views)
  .flat()
  .map(({ id }) => id)
const MILLISECONDS_PER_SECOND = 1000

export async function run(): Promise<void> {
  try {
    report(`VS Code ${vscode.version}`)
    await activate(findExtension())
    await expectContributedCommandsRegistered()
    await expectContributedViewsShown()
    await probeHelloCommand()
    await probeResultView()
  } catch (error) {
    report(`smoke: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

function report(message: string): void {
  console.log(`>> ${message}`)
}

function findExtension(): vscode.Extension<unknown> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID)
  if (extension === undefined) {
    throw new Error(`extension ${EXTENSION_ID} is not installed`)
  }
  return extension
}

async function activate(extension: vscode.Extension<unknown>): Promise<void> {
  const started = performance.now()
  await extension.activate()
  const seconds = (performance.now() - started) / MILLISECONDS_PER_SECOND
  report(`extension ${EXTENSION_ID} activated in ${seconds.toFixed(3)}s`)
}

async function expectContributedCommandsRegistered(): Promise<void> {
  const registered = new Set(await vscode.commands.getCommands(true))
  const missing = CONTRIBUTED_COMMANDS.filter((command) => !registered.has(command))
  if (missing.length > 0) {
    throw new Error(`contributed commands not registered after activation: ${missing.join(', ')}`)
  }
  report(`contributed commands registered: ${String(CONTRIBUTED_COMMANDS.length)}`)
}

// VS Code registers <view>.focus for every view it knows; focusing it asks the extension for the
// tree, and refreshing it goes through the tree data provider.
async function expectContributedViewsShown(): Promise<void> {
  const registered = new Set(await vscode.commands.getCommands(true))
  const missing = CONTRIBUTED_VIEWS.filter((view) => !registered.has(`${view}.focus`))
  if (missing.length > 0) {
    throw new Error(`contributed views not registered after activation: ${missing.join(', ')}`)
  }
  for (const view of CONTRIBUTED_VIEWS) {
    await vscode.commands.executeCommand(`${view}.focus`)
  }
  await vscode.commands.executeCommand(CommandId.Refresh)
  report(`contributed views registered: ${String(CONTRIBUTED_VIEWS.length)}`)
}

async function probeHelloCommand(): Promise<void> {
  const greeting = await vscode.commands.executeCommand(CommandId.Hello)
  if (typeof greeting !== 'string' || !greeting.startsWith('Hello from sqldoro')) {
    throw new Error(`${CommandId.Hello} answered ${JSON.stringify(greeting)}`)
  }
  report(`${CommandId.Hello} -> ${greeting}`)
}

// The result view is a React bundle in a webview with a strict Content Security Policy: it counts as
// loaded once it runs and tells the extension it is ready.
async function probeResultView(): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    language: SQL_LANGUAGE,
    content: 'SELECT 1',
  })
  await vscode.window.showTextDocument(document)
  const started = performance.now()
  const isLoaded = await vscode.commands.executeCommand(CommandId.ShowResults)
  if (isLoaded !== true) {
    throw new Error(`${CommandId.ShowResults} did not open the result view`)
  }
  const seconds = (performance.now() - started) / MILLISECONDS_PER_SECOND
  report(`result view loaded in ${seconds.toFixed(3)}s`)
}
