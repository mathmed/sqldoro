import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { type HistoryEntry, historyOf, RunOutcome } from '../../core/history/history.ts'
import { formatDuration, plural } from '../../core/results/tabs.ts'
import { CommandId } from '../command-id.ts'
import type { HistoryStore } from './history-store.ts'

export const HistoryNodeKind = {
  Connection: 'historyConnection',
  Entry: 'historyEntry',
} as const

export type HistoryNode =
  | { readonly kind: typeof HistoryNodeKind.Connection; readonly connectionId: string }
  | { readonly kind: typeof HistoryNodeKind.Entry; readonly entry: HistoryEntry }

const LABEL_LENGTH = 80
// YYYY-MM-DDTHH:MM of an ISO 8601 time.
const MINUTES_LENGTH = 16
const WHITESPACE = /\s+/g

// "SELECT * FROM orders WHERE ..." on one line.
export function entryLabel(entry: HistoryEntry): string {
  const line = entry.sql.replaceAll(WHITESPACE, ' ').trim()
  return line.length > LABEL_LENGTH ? `${line.slice(0, LABEL_LENGTH - 1)}…` : line
}

// 2026-10-10 03:00 UTC: the same on every machine.
export function entryTime(entry: HistoryEntry): string {
  return `${entry.startedAt.slice(0, MINUTES_LENGTH).replace('T', ' ')} UTC`
}

// The Query History view: the statements each connection ran, newest first.
export class HistoryView implements vscode.TreeDataProvider<HistoryNode>, vscode.Disposable {
  readonly #store: HistoryStore
  readonly #connections: () => readonly ConnectionConfig[]
  readonly #changes = new vscode.EventEmitter<undefined>()
  readonly #subscription: vscode.Disposable
  readonly onDidChangeTreeData = this.#changes.event

  constructor(store: HistoryStore, connections: () => readonly ConnectionConfig[]) {
    this.#store = store
    this.#connections = connections
    this.#subscription = store.onDidChange(() => {
      this.#changes.fire(undefined)
    })
  }

  getTreeItem(node: HistoryNode): vscode.TreeItem {
    return node.kind === HistoryNodeKind.Connection
      ? this.#connectionItem(node.connectionId)
      : entryItem(node.entry)
  }

  getChildren(node?: HistoryNode): HistoryNode[] {
    const entries = this.#store.list()
    if (node === undefined) {
      return this.#connections()
        .filter((connection) => historyOf(entries, connection.id).length > 0)
        .map((connection) => ({ kind: HistoryNodeKind.Connection, connectionId: connection.id }))
    }
    return node.kind === HistoryNodeKind.Connection
      ? historyOf(entries, node.connectionId).map((entry) => ({
          kind: HistoryNodeKind.Entry,
          entry,
        }))
      : []
  }

  refresh(): void {
    this.#changes.fire(undefined)
  }

  dispose(): void {
    this.#subscription.dispose()
    this.#changes.dispose()
  }

  #connectionItem(connectionId: string): vscode.TreeItem {
    const connection = this.#connections().find((candidate) => candidate.id === connectionId)
    const item = new vscode.TreeItem(
      connection?.name ?? connectionId,
      vscode.TreeItemCollapsibleState.Collapsed,
    )
    item.id = `history:${connectionId}`
    item.iconPath = new vscode.ThemeIcon('database')
    item.description = plural(
      historyOf(this.#store.list(), connectionId).length,
      'statement',
      'statements',
    )
    item.contextValue = HistoryNodeKind.Connection
    return item
  }
}

function entryItem(entry: HistoryEntry): vscode.TreeItem {
  const item = new vscode.TreeItem(entryLabel(entry), vscode.TreeItemCollapsibleState.None)
  item.id = `history:${entry.id}`
  item.iconPath = new vscode.ThemeIcon(outcomeIcon(entry.outcome))
  item.description = entryTime(entry)
  item.tooltip = entryTooltip(entry)
  item.contextValue = HistoryNodeKind.Entry
  item.command = {
    command: CommandId.OpenHistoryEntry,
    title: 'Open in Editor',
    arguments: [{ kind: HistoryNodeKind.Entry, entry }],
  }
  return item
}

function outcomeIcon(outcome: RunOutcome): string {
  switch (outcome) {
    case RunOutcome.Succeeded:
      return 'pass'
    case RunOutcome.Failed:
      return 'error'
    case RunOutcome.Cancelled:
      return 'circle-slash'
  }
}

function entryTooltip(entry: HistoryEntry): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString()
  tooltip.appendCodeblock(entry.sql, 'sql')
  const where =
    entry.schema === '' || entry.schema === entry.database
      ? entry.database
      : `${entry.database}.${entry.schema}`
  tooltip.appendText(
    `${entry.outcome} in ${formatDuration(entry.durationMs)} on ${where}, ${entryTime(entry)}`,
  )
  if (entry.message !== '') {
    tooltip.appendText(`\n${entry.message}`)
  }
  return tooltip
}
