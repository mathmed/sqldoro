import * as vscode from 'vscode'

export interface TextPrompt {
  readonly title: string
  readonly prompt: string
  readonly value: string
  readonly placeHolder: string
  readonly isPassword?: boolean
  readonly validate?: (value: string) => string | undefined
}

export interface Choice<T> {
  readonly label: string
  readonly value: T
  readonly description?: string
  readonly detail?: string
}

// Undefined when the user dismissed the prompt.
export async function askText(prompt: TextPrompt): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: prompt.title,
    prompt: prompt.prompt,
    value: prompt.value,
    placeHolder: prompt.placeHolder,
    password: prompt.isPassword ?? false,
    ignoreFocusOut: true,
    validateInput: (value) => prompt.validate?.(value),
  })
}

export async function askChoice<T>(
  title: string,
  choices: readonly Choice<T>[],
): Promise<T | undefined> {
  const picked = await vscode.window.showQuickPick(
    choices.map((choice) => ({ ...choice, label: choice.label })),
    { title, ignoreFocusOut: true },
  )
  return picked?.value
}

export async function askFile(title: string): Promise<string | undefined> {
  const files = await vscode.window.showOpenDialog({
    title,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Select',
  })
  return files?.[0]?.fsPath
}
