// The window and the workspace of the fake VS Code: prompts, views, output channels, editors and
// documents, the status bar, the clipboard and the settings.
import { readFile } from 'node:fs/promises'

import { vi } from 'vitest'

import { createInputBox, createQuickPick, resetPickers } from './pickers.ts'
import { registerFileDecorationProvider, resetTabs, tabGroups } from './tabs.ts'
import { FakeTextDocument, FakeTextEditor } from './text.ts'
import { FakeUri } from './uri.ts'
import { createWebviewPanel, webviewPanels } from './webviews.ts'

type Listener<T> = (event: T) => unknown
type ProgressTask<T> = (
  progress: { report: () => void },
  token: { isCancellationRequested: boolean },
) => Promise<T>

export interface Disposable {
  dispose: () => void
}

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

export interface FakeTreeView {
  readonly viewId: string
  readonly options: { treeDataProvider: unknown }
  message: string | undefined
  readonly dispose: () => void
}

export interface FakeOutputChannel {
  readonly name: string
  readonly debug: ReturnType<typeof vi.fn>
  readonly info: ReturnType<typeof vi.fn>
  readonly warn: ReturnType<typeof vi.fn>
  readonly error: ReturnType<typeof vi.fn>
  readonly show: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
}

export interface FakeStatusBarItem {
  readonly alignment: number
  readonly priority: number
  name: string
  text: string
  tooltip: string
  command: string | undefined
  backgroundColor: { readonly id: string } | undefined
  color: { readonly id: string } | undefined
  isVisible: boolean
  readonly show: () => void
  readonly hide: () => void
  readonly dispose: () => void
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const
export const ViewColumn = { Active: -1, Beside: -2, One: 1 } as const

export const treeViews: FakeTreeView[] = []
export const outputChannels: FakeOutputChannel[] = []
export const statusBarItems: FakeStatusBarItem[] = []
export const contentProviders = new Map<
  string,
  { provideTextDocumentContent: (uri: FakeUri) => unknown }
>()
// The settings of the user, by full key (sqldoro.results.maxRows).
class FakeSettings {
  readonly #values = new Map<string, unknown>()

  set(key: string, value: unknown): void {
    this.#values.set(key, value)
  }

  get(key: string): unknown {
    return this.#values.get(key)
  }

  clear(): void {
    this.#values.clear()
  }
}

export const settings = new FakeSettings()
export const documents: FakeTextDocument[] = []

const activeEditorChanges = new EventEmitter<FakeTextEditor | undefined>()
const closedDocuments = new EventEmitter<FakeTextDocument>()
let activeTextEditor: FakeTextEditor | undefined
let untitledCount = 0

function statusBarItem(alignment: number, priority: number): FakeStatusBarItem {
  const item: FakeStatusBarItem = {
    alignment,
    priority,
    name: '',
    text: '',
    tooltip: '',
    command: undefined,
    backgroundColor: undefined,
    color: undefined,
    isVisible: false,
    show: () => {
      item.isVisible = true
    },
    hide: () => {
      item.isVisible = false
    },
    dispose: vi.fn(),
  }
  statusBarItems.push(item)
  return item
}

function outputChannel(name: string): FakeOutputChannel {
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
}

// Shows the document in an editor and makes it the active one, like VS Code.
export function showEditor(document: FakeTextDocument): FakeTextEditor {
  const editor = new FakeTextEditor(document)
  activeTextEditor = editor
  activeEditorChanges.fire(editor)
  return editor
}

export function closeDocument(document: FakeTextDocument): void {
  document.close()
  documents.splice(documents.indexOf(document), 1)
  closedDocuments.fire(document)
}

// A URI opens through its content provider (or from the disk); options open an untitled document.
async function openTextDocument(
  source: FakeUri | { language?: string; content?: string },
): Promise<FakeTextDocument> {
  if (source instanceof FakeUri) {
    return addDocument(new FakeTextDocument(source, await contentOf(source), languageOf(source)))
  }
  untitledCount += 1
  const uri = new FakeUri('untitled', `Untitled-${String(untitledCount)}`)
  return addDocument(
    new FakeTextDocument(uri, source.content ?? '', source.language ?? 'plaintext'),
  )
}

async function contentOf(uri: FakeUri): Promise<string> {
  const provider = contentProviders.get(uri.scheme)
  return provider === undefined
    ? readFile(uri.fsPath, 'utf8')
    : String(await provider.provideTextDocumentContent(uri))
}

function languageOf(uri: FakeUri): string {
  return uri.path.endsWith('.sql') ? 'sql' : 'plaintext'
}

function addDocument(document: FakeTextDocument): FakeTextDocument {
  documents.push(document)
  return document
}

export const window = {
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  setStatusBarMessage: vi.fn(),
  get activeTextEditor(): FakeTextEditor | undefined {
    return activeTextEditor
  },
  onDidChangeActiveTextEditor: activeEditorChanges.event,
  // Like VS Code, it takes a document or the URI of one.
  showTextDocument: async (target: FakeTextDocument | FakeUri): Promise<FakeTextEditor> =>
    showEditor(target instanceof FakeUri ? await openTextDocument(target) : target),
  createTreeView: (viewId: string, options: { treeDataProvider: unknown }): FakeTreeView => {
    const view: FakeTreeView = { viewId, options, message: undefined, dispose: vi.fn() }
    treeViews.push(view)
    return view
  },
  createOutputChannel: outputChannel,
  createStatusBarItem: statusBarItem,
  createWebviewPanel,
  createInputBox,
  createQuickPick,
  registerFileDecorationProvider,
  tabGroups,
  withProgress: async <T>(...[, task]: [unknown, ProgressTask<T>]): Promise<T> =>
    task({ report: vi.fn() }, { isCancellationRequested: false }),
}

export const workspace = {
  fs: {
    readFile: async (uri: { fsPath: string }): Promise<Uint8Array> => readFile(uri.fsPath),
    writeFile: vi.fn(async () => Promise.resolve()),
  },
  get textDocuments(): readonly FakeTextDocument[] {
    return documents
  },
  openTextDocument,
  onDidCloseTextDocument: closedDocuments.event,
  registerTextDocumentContentProvider: (
    scheme: string,
    provider: { provideTextDocumentContent: (uri: FakeUri) => unknown },
  ): Disposable => {
    contentProviders.set(scheme, provider)
    return {
      dispose: () => {
        contentProviders.delete(scheme)
      },
    }
  },
  getConfiguration: (section: string): { get: (key: string) => unknown } => ({
    get: (key) => settings.get(`${section}.${key}`),
  }),
}

export const env = {
  clipboard: { writeText: vi.fn(async () => Promise.resolve()) },
}

export function resetWorkbench(): void {
  resetTabs()
  resetPickers()
  webviewPanels.length = 0
  treeViews.length = 0
  outputChannels.length = 0
  statusBarItems.length = 0
  contentProviders.clear()
  settings.clear()
  documents.length = 0
  activeTextEditor = undefined
  untitledCount = 0
}
