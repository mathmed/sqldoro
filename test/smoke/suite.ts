// Runs inside a real VS Code (Extension Development Host) launched by scripts/smoke.ts. Every line
// starting with `>> ` is read by the smoke analyzer of the Quality Report.
import * as vscode from 'vscode'

import manifest from '../../package.json' with { type: 'json' }
import { CommandId } from '../../src/extension/command-id.ts'

const EXTENSION_ID = `${manifest.publisher}.${manifest.name}`
const CONTRIBUTED_COMMANDS = manifest.contributes.commands.map(({ command }) => command)
const MILLISECONDS_PER_SECOND = 1000

export async function run(): Promise<void> {
  try {
    report(`VS Code ${vscode.version}`)
    await activate(findExtension())
    await expectContributedCommandsRegistered()
    await probeHelloCommand()
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

async function probeHelloCommand(): Promise<void> {
  const greeting = await vscode.commands.executeCommand(CommandId.Hello)
  if (typeof greeting !== 'string' || !greeting.startsWith('Hello from sqldoro')) {
    throw new Error(`${CommandId.Hello} answered ${JSON.stringify(greeting)}`)
  }
  report(`${CommandId.Hello} -> ${greeting}`)
}
