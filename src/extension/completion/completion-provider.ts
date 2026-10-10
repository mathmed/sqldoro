import * as vscode from 'vscode'

import { catalogNeeds, type LoadedCatalog, NO_NEEDS } from '../../core/completion/catalog-needs.ts'
import { completionAt } from '../../core/completion/context.ts'
import {
  buildSuggestions,
  type Suggestion,
  SuggestionKind,
} from '../../core/completion/suggestions.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { bindingScope } from '../../core/editor/binding.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { EditorBindings } from '../editor/bindings.ts'
import type { CatalogLoad, SchemaCache } from './schema-cache.ts'

export interface CompletionDependencies {
  readonly bindings: EditorBindings
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly engines: EngineRegistry
  // The explorer's session: the autocomplete never opens a connection by itself.
  readonly session: (connectionId: string) => EngineSession | undefined
  readonly cache: SchemaCache
}

export const TRIGGER_CHARACTERS: readonly string[] = ['.', '"', '`']
// The catalog a request waits for: past this, it offers what is there and asks to be asked again.
const BUDGET_MS = 750
const EMPTY_CATALOG: LoadedCatalog = {
  databases: [],
  schemas: [],
  objects: new Map(),
  columns: new Map(),
}
const KINDS: ReadonlyMap<string, vscode.CompletionItemKind> = new Map([
  [SuggestionKind.Column, vscode.CompletionItemKind.Field],
  [SuggestionKind.Alias, vscode.CompletionItemKind.Variable],
  [SuggestionKind.Table, vscode.CompletionItemKind.Struct],
  [SuggestionKind.View, vscode.CompletionItemKind.Interface],
  [SuggestionKind.Schema, vscode.CompletionItemKind.Module],
  [SuggestionKind.Database, vscode.CompletionItemKind.Folder],
  [SuggestionKind.Keyword, vscode.CompletionItemKind.Keyword],
])

// Schema-aware completion for SQL editors with a connection: names of the catalog and keywords of
// the dialect, quoted where the dialect needs it.
export class SqlCompletionProvider implements vscode.CompletionItemProvider {
  readonly #dependencies: CompletionDependencies

  constructor(dependencies: CompletionDependencies) {
    this.#dependencies = dependencies
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionList | undefined> {
    const binding = this.#dependencies.bindings.get(document.uri)
    const connection =
      binding === undefined ? undefined : this.#dependencies.connections(binding.connectionId)
    if (binding === undefined || connection === undefined) {
      return undefined
    }
    const { dialect } = this.#dependencies.engines.get(connection.engine)
    const { context, base } = completionAt(
      document.getText(),
      document.offsetAt(position),
      dialect.lexical,
    )
    const needs = catalogNeeds(context, bindingScope(binding, dialect), dialect)
    const { catalog, isComplete } = await this.#load(connection.id, needs, token)
    const suggestions = buildSuggestions({ context, needs, catalog }, dialect)
    const range = new vscode.Range(document.positionAt(base + context.prefixStart), position)
    const items = suggestions.items.map((suggestion) => completionItem(suggestion, range))
    return new vscode.CompletionList(items, suggestions.isIncomplete || !isComplete)
  }

  async #load(
    connectionId: string,
    needs: ReturnType<typeof catalogNeeds>,
    token: vscode.CancellationToken,
  ): Promise<CatalogLoad> {
    const session = this.#dependencies.session(connectionId)
    if (session === undefined || needs === NO_NEEDS) {
      return { catalog: EMPTY_CATALOG, isComplete: true }
    }
    const { promise: deadline, resolve } = Promise.withResolvers<undefined>()
    const timer = setTimeout(() => {
      resolve(undefined)
    }, BUDGET_MS)
    const cancelled = token.onCancellationRequested(() => {
      resolve(undefined)
    })
    try {
      return await this.#dependencies.cache.load(connectionId, session, { needs, deadline })
    } finally {
      clearTimeout(timer)
      cancelled.dispose()
    }
  }
}

function completionItem(suggestion: Suggestion, range: vscode.Range): vscode.CompletionItem {
  const item = new vscode.CompletionItem(suggestion.label, KINDS.get(suggestion.kind))
  item.detail = suggestion.detail
  item.insertText = suggestion.insertText
  item.filterText = suggestion.filterText
  item.sortText = suggestion.sortText
  item.range = range
  return item
}
