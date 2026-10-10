// The tabs of the editors and the decorations of their documents.
import type { FakeUri } from './uri.ts'

interface Disposable {
  dispose: () => void
}

type Listener<T> = (event: T) => unknown

class Emitter<T> {
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
}

// What a tab shows: a text document (other inputs are not text).
export class TabInputText {
  readonly uri: FakeUri

  constructor(uri: FakeUri) {
    this.uri = uri
  }
}

export interface FakeTab {
  readonly input: unknown
}

export class FileDecoration {
  readonly badge: string | undefined
  readonly tooltip: string | undefined
  readonly color: { readonly id: string } | undefined
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the name the VS Code API gives it
  propagate = false

  constructor(badge?: string, tooltip?: string, color?: { readonly id: string }) {
    this.badge = badge
    this.tooltip = tooltip
    this.color = color
  }
}

export interface FakeDecorationProvider {
  readonly provideFileDecoration: (uri: FakeUri) => FileDecoration | undefined
  readonly onDidChangeFileDecorations: (listener: () => unknown) => Disposable
}

export const fileDecorationProviders: FakeDecorationProvider[] = []
const tabs: FakeTab[] = []
const tabChanges = new Emitter<{ opened: FakeTab[]; closed: FakeTab[]; changed: FakeTab[] }>()

// Opens a tab on a document, like an editor would; closing it fires the change VS Code fires.
export function openTab(uri: FakeUri): FakeTab {
  const tab = { input: new TabInputText(uri) }
  tabs.push(tab)
  tabChanges.fire({ opened: [tab], closed: [], changed: [] })
  return tab
}

export function closeTab(tab: FakeTab): void {
  tabs.splice(tabs.indexOf(tab), 1)
  tabChanges.fire({ opened: [], closed: [tab], changed: [] })
}

export const tabGroups = {
  get all(): readonly { readonly tabs: readonly FakeTab[] }[] {
    return [{ tabs }]
  },
  onDidChangeTabs: tabChanges.event,
}

export function registerFileDecorationProvider(provider: FakeDecorationProvider): Disposable {
  fileDecorationProviders.push(provider)
  return {
    dispose: () => {
      fileDecorationProviders.splice(fileDecorationProviders.indexOf(provider), 1)
    },
  }
}

export function resetTabs(): void {
  fileDecorationProviders.length = 0
  tabs.length = 0
}
