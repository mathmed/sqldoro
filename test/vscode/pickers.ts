// The input boxes and quick picks the extension creates, which the tests type in, accept and close
// as a user would.
import { vi } from 'vitest'
import type * as vscode from 'vscode'

type Listener<T> = (event: T) => unknown

class Emitter<T> {
  readonly #listeners = new Set<Listener<T>>()

  readonly event = (listener: Listener<T>): { dispose: () => void } => {
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
}

// What both kinds of boxes share: shown, hidden once, disposed.
class FakeBox {
  title = ''
  placeholder = ''
  isShown = false
  isDisposed = false
  readonly #hidden = new Emitter<undefined>()
  readonly #accepted = new Emitter<undefined>()
  readonly onDidHide = this.#hidden.event
  readonly onDidAccept = this.#accepted.event

  show(): void {
    this.isShown = true
  }

  hide(): void {
    if (this.isShown) {
      this.isShown = false
      this.#hidden.fire(undefined)
    }
  }

  dispose(): void {
    this.isDisposed = true
  }

  // Enter.
  accept(): void {
    this.#accepted.fire(undefined)
  }

  // Escape.
  escape(): void {
    this.hide()
  }
}

export class FakeInputBox extends FakeBox {
  prompt = ''
  #value = ''
  readonly #changes = new Emitter<string>()
  readonly onDidChangeValue = this.#changes.event

  get value(): string {
    return this.#value
  }

  set value(value: string) {
    this.#value = value
  }

  // What the user types replaces the text, as it is typed.
  type(text: string): void {
    this.#value = text
    this.#changes.fire(text)
  }
}

// VS Code names some of its flags without a prefix (busy, ignoreFocusOut): an object literal takes
// them as they are.
export type FakeFlaggedBox = FakeInputBox & Pick<vscode.InputBox, 'busy' | 'ignoreFocusOut'>

function flagged(box: FakeInputBox): FakeFlaggedBox {
  return Object.assign(box, { busy: false, ignoreFocusOut: false })
}

// A quick pick is typed in like an input box.
export type FakeQuickPick = FakeFlaggedBox & {
  items: readonly unknown[]
  selectedItems: readonly unknown[]
  readonly pick: (item: unknown) => void
}

function quickPick(): FakeQuickPick {
  const box = flagged(new FakeInputBox())
  return Object.assign(box, {
    matchOnDescription: false,
    items: [] as readonly unknown[],
    selectedItems: [] as readonly unknown[],
    // The user picks an item and presses Enter.
    pick: (item: unknown) => {
      Object.assign(box, { selectedItems: [item] })
      box.accept()
    },
  })
}

export const inputBoxes: FakeFlaggedBox[] = []
export const quickPicks: FakeQuickPick[] = []

export const createInputBox = vi.fn((): FakeFlaggedBox => {
  const box = flagged(new FakeInputBox())
  inputBoxes.push(box)
  return box
})

export const createQuickPick = vi.fn((): FakeQuickPick => {
  const pick = quickPick()
  quickPicks.push(pick)
  return pick
})

export function resetPickers(): void {
  inputBoxes.length = 0
  quickPicks.length = 0
}
