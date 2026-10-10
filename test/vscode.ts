// Stands in for the `vscode` module, which only exists inside the VS Code extension host (mocked
// in test/setup.ts). It covers the slice of the API the extension uses and behaves like VS Code where
// that matters to a test: a command id can be registered only once and disposing frees it.
import { vi } from 'vitest'

type CommandHandler = (...args: unknown[]) => unknown

interface Disposable {
  dispose: () => void
}

const handlers = new Map<string, CommandHandler>()

export const ExtensionMode = {
  Production: 1,
  Development: 2,
  Test: 3,
} as const

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
    const handler = handlers.get(command)
    if (handler === undefined) {
      throw new Error(`command '${command}' not found`)
    }
    return await Promise.resolve(handler(...args))
  },
}

export const window = {
  showInformationMessage: vi.fn(),
}
