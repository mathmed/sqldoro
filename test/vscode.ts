// Stands in for the `vscode` module, which only exists inside the VS Code extension host (mocked
// in test/setup.ts). It covers the slice of the API the extension uses and behaves like VS Code where
// that matters to a test: a command id can be registered only once and disposing frees it, events
// reach their listeners until they are disposed, files are read from the disk.
import { readFile } from 'node:fs/promises'

import { vi } from 'vitest'

type CommandHandler = (...args: unknown[]) => unknown
type Listener<T> = (event: T) => unknown
type ProgressTask<T> = (
  progress: { report: () => void },
  token: { isCancellationRequested: boolean },
) => Promise<T>

export interface Disposable {
  dispose: () => void
}

const handlers = new Map<string, CommandHandler>()
// Commands VS Code itself provides: they answer without a handler from the extension.
const BUILT_IN_COMMANDS: ReadonlySet<string> = new Set(['setContext'])

export const contextKeys = new Map<string, unknown>()

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

export class EventEmitter<T> {
  readonly #listeners = new Set<Listener<T>>()

  readonly event = (listener: Listener<T>): Disposable => {
    this.#listeners.add(listener)
    return {
      dispose: () => {
        this.#listeners.delete(listener)
      },
    }
  }

  fire(data: T): void {
    for (const listener of [...this.#listeners]) {
      listener(data)
    }
  }

  dispose(): void {
    this.#listeners.clear()
  }
}

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

export class TreeItem {
  readonly label: string
  collapsibleState: number
  id?: string
  description?: string
  tooltip?: string
  iconPath?: ThemeIcon
  contextValue?: string
  command?: { command: string; title: string; arguments?: unknown[] }

  constructor(label: string, collapsibleState = TreeItemCollapsibleState.None) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}

interface FakeUri {
  readonly scheme: string
  readonly path: string
  readonly fsPath: string
}

export const Uri = {
  file: (path: string): FakeUri => ({ scheme: 'file', path, fsPath: path }),
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
    if (BUILT_IN_COMMANDS.has(command)) {
      contextKeys.set(String(args[0]), args[1])
      return undefined
    }
    const handler = handlers.get(command)
    if (handler === undefined) {
      throw new Error(`command '${command}' not found`)
    }
    return await Promise.resolve(handler(...args))
  },
}

export interface FakeTreeView {
  readonly viewId: string
  readonly options: { treeDataProvider: unknown }
  message: string | undefined
  readonly dispose: () => void
}

export const treeViews: FakeTreeView[] = []

export interface FakeOutputChannel {
  readonly name: string
  readonly debug: ReturnType<typeof vi.fn>
  readonly info: ReturnType<typeof vi.fn>
  readonly warn: ReturnType<typeof vi.fn>
  readonly error: ReturnType<typeof vi.fn>
  readonly show: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
}

export const outputChannels: FakeOutputChannel[] = []

export const window = {
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  showOpenDialog: vi.fn(),
  createTreeView: (viewId: string, options: { treeDataProvider: unknown }): FakeTreeView => {
    const view: FakeTreeView = { viewId, options, message: undefined, dispose: vi.fn() }
    treeViews.push(view)
    return view
  },
  createOutputChannel: (name: string): FakeOutputChannel => {
    const channel = {
      name,
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    }
    outputChannels.push(channel)
    return channel
  },
  withProgress: async <T>(...[, task]: [unknown, ProgressTask<T>]): Promise<T> =>
    task({ report: vi.fn() }, { isCancellationRequested: false }),
}

export const workspace = {
  fs: {
    readFile: async (uri: { fsPath: string }): Promise<Uint8Array> => readFile(uri.fsPath),
  },
}

// Brings the fake back to a fresh VS Code between tests.
export function resetVscode(): void {
  handlers.clear()
  contextKeys.clear()
  treeViews.length = 0
  outputChannels.length = 0
}
