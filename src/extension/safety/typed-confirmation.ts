import * as vscode from 'vscode'

import { confirmationProblem, isConfirmed } from '../../core/safety/guard.ts'

// What a deliberate act asks: a title, why, and what must be typed, exactly.
export interface TypedConfirmation {
  readonly title: string
  readonly prompt: string
  readonly expected: string
}

// Typing a name or a number, once, for this run only: an input box that stays open until it is
// typed exactly or dismissed.
export async function askTyped(confirmation: TypedConfirmation): Promise<boolean> {
  const typed = await vscode.window.showInputBox({
    title: confirmation.title,
    prompt: confirmation.prompt,
    placeHolder: confirmation.expected,
    ignoreFocusOut: true,
    validateInput: (value) => confirmationProblem(value, confirmation.expected),
  })
  return typed !== undefined && isConfirmed(typed, confirmation.expected)
}
