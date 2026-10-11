// Stands in for the `vscode` module, which only exists inside the VS Code extension host (mocked
// in test/setup.ts). It covers the slice of the API the extension uses and behaves like VS Code where
// that matters to a test: a command id can be registered only once and disposing frees it, events
// reach their listeners until they are disposed, files are read from the disk, documents and editors
// keep their text in memory (test/vscode/).
import {
  completionProviders,
  diagnosticCollections,
  type MarkdownString,
} from './vscode/languages.ts'
import { type Disposable, resetWorkbench } from './vscode/workbench.ts'

export * from './vscode/languages.ts'
export * from './vscode/pickers.ts'
export * from './vscode/tabs.ts'
export * from './vscode/text.ts'
export * from './vscode/uri.ts'
export * from './vscode/webviews.ts'
export * from './vscode/workbench.ts'

type CommandHandler = (...args: unknown[]) => unknown
const handlers = new Map<string, CommandHandler>()
// Commands VS Code and its built-in extensions provide: they answer without a handler from the
// extension, and the fake records the calls. A test takes one away like a disabled built-in
// extension would.
const BUILT_IN_COMMANDS: ReadonlySet<string> = new Set([
  'setContext',
  'workbench.action.openWalkthrough',
  'markdown.showPreview',
])

export const contextKeys = new Map<string, unknown>()
export const builtInCalls: { readonly command: string; readonly args: readonly unknown[] }[] = []
const missingBuiltIns = new Set<string>()

// Takes a built-in command away, as when the built-in extension that provides it is disabled.
export function disableBuiltIn(command: string): void {
  missingBuiltIns.add(command)
}

export const ExtensionMode = {
  Production: 1,
  Development: 2,
  Test: 3,
} as const

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
} as const

export const QuickPickItemKind = {
  Separator: -1,
  Default: 0,
} as const

export const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15,
} as const

export class ThemeColor {
  readonly id: string

  constructor(id: string) {
    this.id = id
  }
}

export class ThemeIcon {
  readonly id: string
  readonly color: ThemeColor | undefined

  constructor(id: string, color?: ThemeColor) {
    this.id = id
    this.color = color
  }
}

// A label with parts of it highlighted (the matches of a filter), as start and end offsets.
export interface TreeItemLabel {
  readonly label: string
  readonly highlights?: readonly (readonly [number, number])[]
}

export class TreeItem {
  label: string | TreeItemLabel
  collapsibleState: number
  id?: string
  description?: string
  tooltip?: string | MarkdownString
  iconPath?: ThemeIcon
  contextValue?: string
  command?: { command: string; title: string; arguments?: unknown[] }

  constructor(label: string | TreeItemLabel, collapsibleState = TreeItemCollapsibleState.None) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}

export const commands = {
  registerCommand(command: string, handler: CommandHandler): Disposable {
    if (handlers.has(command)) {
      throw new Error(`command '${command}' already exists`)
    }
    handlers.set(command, handler)
    return {
      dispose: () => {
        handlers.delete(command)
      },
    }
  },
  async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    if (BUILT_IN_COMMANDS.has(command) && !missingBuiltIns.has(command)) {
      builtInCalls.push({ command, args })
      if (command === 'setContext') {
        contextKeys.set(String(args[0]), args[1])
      }
      return undefined
    }
    const handler = handlers.get(command)
    if (handler === undefined) {
      throw new Error(`command '${command}' not found`)
    }
    return await Promise.resolve(handler(...args))
  },
}

// Brings the fake back to a fresh VS Code between tests.
export function resetVscode(): void {
  handlers.clear()
  contextKeys.clear()
  builtInCalls.length = 0
  missingBuiltIns.clear()
  completionProviders.length = 0
  diagnosticCollections.length = 0
  resetWorkbench()
}
