// Diagnostics, completion items and Markdown, kept as plain values the tests can read.
import type { Position, Range } from './text.ts'
import type { FakeUri } from './uri.ts'

export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 } as const

export class Diagnostic {
  readonly range: Range
  readonly message: string
  readonly severity: number
  source?: string

  constructor(range: Range, message: string, severity: number) {
    this.range = range
    this.message = message
    this.severity = severity
  }
}

export class FakeDiagnosticCollection {
  readonly name: string
  readonly entries = new Map<string, readonly Diagnostic[]>()
  isDisposed = false

  constructor(name: string) {
    this.name = name
  }

  set(uri: FakeUri, diagnostics: readonly Diagnostic[]): void {
    this.entries.set(uri.toString(), diagnostics)
  }

  get(uri: FakeUri): readonly Diagnostic[] | undefined {
    return this.entries.get(uri.toString())
  }

  delete(uri: FakeUri): void {
    this.entries.delete(uri.toString())
  }

  dispose(): void {
    this.isDisposed = true
  }
}

export const CompletionItemKind = {
  Field: 4,
  Variable: 5,
  Interface: 7,
  Module: 8,
  Keyword: 13,
  Folder: 18,
  Struct: 21,
} as const

export class CompletionItem {
  readonly label: string
  readonly kind: number | undefined
  detail?: string
  insertText?: string
  filterText?: string
  sortText?: string
  range?: Range

  constructor(label: string, kind?: number) {
    this.label = label
    this.kind = kind
  }
}

export class CompletionList {
  readonly items: CompletionItem[]
  readonly isIncomplete: boolean

  constructor(items: CompletionItem[], isIncomplete = false) {
    this.items = items
    this.isIncomplete = isIncomplete
  }
}

export class MarkdownString {
  value = ''

  appendCodeblock(code: string, language: string): this {
    this.value += `\n\`\`\`${language}\n${code}\n\`\`\`\n`
    return this
  }

  appendText(text: string): this {
    this.value += text
    return this
  }
}

export interface RegisteredCompletion {
  readonly selector: unknown
  readonly provider: {
    readonly provideCompletionItems: (
      document: unknown,
      position: Position,
      token: unknown,
    ) => unknown
  }
  readonly triggers: readonly string[]
}

export const completionProviders: RegisteredCompletion[] = []
export const diagnosticCollections: FakeDiagnosticCollection[] = []

export const languages = {
  registerCompletionItemProvider: (
    selector: unknown,
    provider: RegisteredCompletion['provider'],
    ...triggers: string[]
  ): { dispose: () => void } => {
    const registration = { selector, provider, triggers }
    completionProviders.push(registration)
    return {
      dispose: () => {
        completionProviders.splice(completionProviders.indexOf(registration), 1)
      },
    }
  },
  createDiagnosticCollection: (name: string): FakeDiagnosticCollection => {
    const collection = new FakeDiagnosticCollection(name)
    diagnosticCollections.push(collection)
    return collection
  },
}
