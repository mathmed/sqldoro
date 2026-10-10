// Plays the connection form webview against the extension: finds the panel of a form, loads it,
// sends what the user did and reads what the extension answered.
import { type Mock, vi } from 'vitest'
import type * as vscode from 'vscode'

import { FormMode } from '../../src/core/connection-form/protocol.ts'
import type { ConnectionConfig } from '../../src/core/connection/connection.ts'
import { ConnectionForms } from '../../src/extension/form/connection-forms.ts'
import type { FormRequest, FormServices } from '../../src/extension/form/form-request.ts'
import { VALID_CONNECTION } from '../fixtures/connection-form.ts'
import { FakeWebviewPanel, Uri, webviewPanels } from '../vscode.ts'
import { type CommandHarness, commandHarness, type HarnessOptions } from './commands.ts'

const FORM_VIEW_TYPE = 'sqldoro.connectionForm'

// The connection forms that are open, oldest first.
export function formPanels(): FakeWebviewPanel[] {
  return webviewPanels.filter((panel) => panel.viewType === FORM_VIEW_TYPE && !panel.isDisposed)
}

export function lastFormPanel(): FakeWebviewPanel {
  const panel = formPanels().at(-1)
  if (!(panel instanceof FakeWebviewPanel)) {
    throw new Error('no connection form is open')
  }
  return panel
}

// Lets the extension finish handling what it was sent: its storage answers at once.
export async function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

// Runs a command that opens a form, loads the form and resolves with it and the command's answer.
export async function openForm(
  command: PromiseLike<unknown>,
): Promise<{ readonly panel: FakeWebviewPanel; readonly answer: unknown }> {
  await settled()
  const panel = lastFormPanel()
  panel.webview.send({ type: 'ready' })
  return { panel, answer: await command }
}

// Sends what the webview would, and waits for the extension to handle it.
export async function fromForm(panel: FakeWebviewPanel, message: object): Promise<void> {
  panel.webview.send(message)
  await settled()
}

// The messages of a type the extension sent the form, in order.
export function sentToForm(panel: FakeWebviewPanel, type: string): Record<string, unknown>[] {
  return (panel.webview.posted as Record<string, unknown>[]).filter(
    (message) => message['type'] === type,
  )
}

// The setup the form opened with.
export function setupOf(panel: FakeWebviewPanel): Record<string, unknown> {
  const [open] = sentToForm(panel, 'open')
  if (open === undefined) {
    throw new Error('the form was not opened')
  }
  return open['setup'] as Record<string, unknown>
}

// The forms of the extension over in-memory storage, with a server test the test controls.
export interface FormHarness {
  readonly commands: CommandHarness
  readonly forms: ConnectionForms
  readonly test: Mock<ServerTest>
  // Opens the form of a request (by default, the edit of SHOP) and loads it.
  readonly loaded: (changes?: Partial<FormRequest>) => Promise<FakeWebviewPanel>
  readonly dispose: () => void
}

type ServerTest = FormServices['test']

export const SHOP: ConnectionConfig = { ...VALID_CONNECTION, id: 'shop' }

export function formRequest(changes: Partial<FormRequest> = {}): FormRequest {
  return {
    mode: FormMode.Edit,
    connection: SHOP,
    heldSecrets: new Set(),
    pendingSecrets: new Map(),
    notices: [],
    ...changes,
  }
}

export function formHarness(options: HarnessOptions = {}): FormHarness {
  const commands = commandHarness(options)
  const test = vi.fn<ServerTest>(async () => Promise.resolve('MySQL 8.4'))
  const forms = new ConnectionForms({
    extensionUri: Uri.file('/ext') as unknown as vscode.Uri,
    service: commands.context.service,
    secrets: commands.context.secrets,
    test,
    policy: () => ({ productionEnvironments: new Set(['prod']) }),
    log: commands.log,
  })
  const loaded = async (changes: Partial<FormRequest> = {}): Promise<FakeWebviewPanel> => {
    forms.open(formRequest(changes))
    const panel = lastFormPanel()
    await fromForm(panel, { type: 'ready' })
    return panel
  }
  const dispose = (): void => {
    forms.dispose()
    commands.dispose()
  }
  return { commands, forms, test, loaded, dispose }
}
