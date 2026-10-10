import * as vscode from 'vscode'

import { buildGreeting } from '../core/greeting.ts'
import { CommandId } from './command-id.ts'

type ActivationContext = Pick<vscode.ExtensionContext, 'extensionMode' | 'subscriptions'>

export function activate(context: ActivationContext): void {
  const isDevelopment = context.extensionMode !== vscode.ExtensionMode.Production
  context.subscriptions.push(
    vscode.commands.registerCommand(CommandId.Hello, () => showGreeting(isDevelopment)),
  )
}

function showGreeting(isDevelopment: boolean): string {
  const greeting = buildGreeting(isDevelopment)
  // Awaiting would block the command until the user dismisses the notification.
  void vscode.window.showInformationMessage(greeting)
  return greeting
}
