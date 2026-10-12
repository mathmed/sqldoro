// Runs inside a real VS Code (Extension Development Host) launched by scripts/smoke.ts. Every line
// starting with `>> ` is read by the smoke analyzer of the Quality Report.
import * as vscode from 'vscode'

import manifest from '../../package.json' with { type: 'json' }
import { CommandId, SQL_LANGUAGE } from '../../src/extension/command-id.ts'

const EXTENSION_ID = `${manifest.publisher}.${manifest.name}`
// Where scripts/smoke.ts installed the package: the extension must come from there, not from the
// working tree.
const PACKAGE_EXTENSIONS = process.env['SQLDORO_SMOKE_EXTENSIONS'] ?? ''
const CONTRIBUTED_COMMANDS = manifest.contributes.commands.map(({ command }) => command)
const CONTRIBUTED_VIEWS = Object.values(manifest.contributes.views)
  .flat()
  .map(({ id }) => id)
const MILLISECONDS_PER_SECOND = 1000
// VS Code prefixes the view type of the webviews of extensions.
const RESULTS_VIEW_TYPE = 'sqldoro.results'
const CONNECTION_FORM_VIEW_TYPE = 'sqldoro.connectionForm'
// How long a picker gets to show before the probe closes it, and to end once closed.
const PICKER_SHOW_MS = 500
const PICKER_END_MS = 5000
const MANUAL_COMMIT = '$(git-commit) Manual commit'
const AUTO_COMMIT = '$(check-all) Auto-commit'

export async function run(): Promise<void> {
  try {
    report(`VS Code ${vscode.version}`)
    await activate(findExtension())
    await expectContributedCommandsRegistered()
    await expectContributedViewsShown()
    await probeHelloCommand()
    await probeResultView()
    await probeResultViewReopens()
    await probeTransactionStatus()
    await probeConnectionForm()
    await probeFindingTables()
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
  if (PACKAGE_EXTENSIONS === '' || !extension.extensionPath.startsWith(PACKAGE_EXTENSIONS)) {
    throw new Error(
      `extension ${EXTENSION_ID} runs from ${extension.extensionPath}, not from the package`,
    )
  }
  report(`extension ${EXTENSION_ID} ${manifest.version} installed from the package`)
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

// Closing the result view drops it (the changes of its rows it had not applied are warned about, so
// that nothing goes silently); showing it again loads a new one, with its grid editor and preview.
async function probeResultViewReopens(): Promise<void> {
  await vscode.window.tabGroups.close(webviewTab(RESULTS_VIEW_TYPE))
  const isLoaded = await vscode.commands.executeCommand(CommandId.ShowResults)
  if (isLoaded !== true) {
    throw new Error(`${CommandId.ShowResults} did not open the result view again`)
  }
  report('result view closed and loaded again')
}

// The connection form is a second React bundle in its own webview: Add Connection answers true once
// it runs under its Content Security Policy and tells the extension it is ready, on the engines to
// choose from. Import Connection from URL opens it the same way, on the input of a connection
// string. Each closes again.
async function probeConnectionForm(): Promise<void> {
  const seconds = await formLoadTime(CommandId.AddConnection)
  report(`connection form loaded in ${seconds.toFixed(3)}s`)
  const importSeconds = await formLoadTime(CommandId.ImportConnectionUrl)
  report(
    `${CommandId.ImportConnectionUrl} loaded the connection form in ${importSeconds.toFixed(3)}s`,
  )
}

// Seconds until the form a command opens has loaded; it closes again.
async function formLoadTime(command: string): Promise<number> {
  const started = performance.now()
  const isLoaded = await vscode.commands.executeCommand(command)
  if (isLoaded !== true) {
    throw new Error(`${command} did not open the connection form`)
  }
  const seconds = (performance.now() - started) / MILLISECONDS_PER_SECOND
  await vscode.window.tabGroups.close(webviewTab(CONNECTION_FORM_VIEW_TYPE))
  return seconds
}

// The status bar of a SQL editor shows its transaction mode; the command that switches it answers
// what the item now shows.
async function probeTransactionStatus(): Promise<void> {
  const manual = await vscode.commands.executeCommand(CommandId.ToggleTransactionMode)
  const auto = await vscode.commands.executeCommand(CommandId.ToggleTransactionMode)
  if (manual !== MANUAL_COMMIT || auto !== AUTO_COMMIT) {
    throw new Error(`${CommandId.ToggleTransactionMode} answered ${JSON.stringify([manual, auto])}`)
  }
  report(`transaction status: ${manual} -> ${auto}`)
}

// Go to Table and Find Table in Explorer open a picker over the connected connections (none here);
// each command ends once its picker closes.
async function probeFindingTables(): Promise<void> {
  for (const command of [CommandId.GoToTable, CommandId.FindTable]) {
    const running = vscode.commands.executeCommand(command)
    await delay(PICKER_SHOW_MS)
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen')
    await Promise.race([
      running,
      delay(PICKER_END_MS).then(() => {
        throw new Error(`${command} did not end once its picker closed`)
      }),
    ])
  }
  report(`${CommandId.GoToTable} and ${CommandId.FindTable} opened and closed their pickers`)
}

async function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

// The editor tab of the webview of this view type.
function webviewTab(viewType: string): vscode.Tab {
  const tab = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find(
      ({ input }) => input instanceof vscode.TabInputWebview && input.viewType.endsWith(viewType),
    )
  if (tab === undefined) {
    throw new Error(`the webview ${viewType} has no tab to close`)
  }
  return tab
}
