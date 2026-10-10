// Plays the user in front of VS Code's prompts: each helper queues the answers to the next quick
// picks, input boxes or file dialogs. Quick pick answers name the item by its label, without the
// leading $(icon); an undefined answer dismisses the prompt. Like VS Code, an input box refuses a
// value its validation rejects.
import type * as vscode from 'vscode'

import { window } from '../vscode.ts'

const ICON = /^\$\([\w~-]+\)\s*/u

interface PromptOptions {
  readonly title?: string
  readonly validateInput?: (value: string) => string | undefined
}

export function labelOf(item: vscode.QuickPickItem): string {
  return item.label.replace(ICON, '')
}

function next<T>(answers: T[], options: PromptOptions | undefined): T {
  if (answers.length === 0) {
    throw new Error(`unexpected prompt "${options?.title ?? ''}"`)
  }
  return answers.shift() as T
}

function find(
  items: readonly vscode.QuickPickItem[],
  label: string,
  title: string,
): vscode.QuickPickItem {
  const item = items.find((candidate) => labelOf(candidate) === label)
  if (item === undefined) {
    throw new Error(`no "${label}" in the quick pick "${title}": ${items.map(labelOf).join(', ')}`)
  }
  return item
}

const ACCEPT_ANYTHING = (): undefined => undefined

function checked(value: string | undefined, options: PromptOptions = {}): string | undefined {
  const validate = options.validateInput ?? ACCEPT_ANYTHING
  const problem = value === undefined ? undefined : validate(value)
  if (problem !== undefined) {
    throw new Error(`an input box refuses "${String(value)}": ${problem}`)
  }
  return value
}

export function answerQuickPicks(...labels: (string | undefined)[]): void {
  window.showQuickPick.mockImplementation(
    async (items: readonly vscode.QuickPickItem[], options?: PromptOptions) => {
      const label = next(labels, options)
      return Promise.resolve(
        label === undefined ? undefined : find(items, label, options?.title ?? ''),
      )
    },
  )
}

export function answerInputs(...values: (string | undefined)[]): void {
  window.showInputBox.mockImplementation(async (options?: PromptOptions) =>
    Promise.resolve(checked(next(values, options), options ?? {})),
  )
}

export function answerFiles(...paths: (string | undefined)[]): void {
  window.showOpenDialog.mockImplementation(async (options?: PromptOptions) => {
    const path = next(paths, options)
    return Promise.resolve(path === undefined ? undefined : [{ fsPath: path }])
  })
}

// The items of the quick pick shown last.
export function lastQuickPickItems(): readonly vscode.QuickPickItem[] {
  const items = window.showQuickPick.mock.calls.at(-1)?.[0] as
    readonly vscode.QuickPickItem[] | undefined
  return items ?? []
}
