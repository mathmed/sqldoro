import type * as vscode from 'vscode'

import type { ObjectRef } from '../../core/engine/catalog.ts'
import { type KeyMatch, keyText } from '../../core/navigation/keys.ts'
import { linkAt, linkKey, tableLabel } from '../../core/navigation/links.ts'
import { previewCell } from '../../core/results/cells.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { PeekView } from '../../core/results/tab-meta.ts'
import { tableRowQuery } from '../../core/results/table-query.ts'
import { type ReadOutcome, readThroughGuards } from '../editor/guarded-read.ts'
import { parameterTypesOf } from '../metadata/parameter-types.ts'
import type { TableContext } from '../tables/table-context.ts'

export interface PeekRequest {
  readonly tab: ResultSet
  readonly row: number
  readonly column: number
}

// A peek shows the first columns of the row, each cut to fit the popup.
const PEEK_COLUMNS = 8
const PEEK_CELL_LENGTH = 200
const BUSY = 'Rows are being read in this panel: try again once they are here.'
const NOWHERE = 'This cell points at no row: it is NULL.'
const GONE = 'The row this cell points at is not there (any more).'

// The referenced rows the panels peeked at, by panel and row: a peek of the same row again asks the
// server nothing. A panel that closes forgets them.
export class PeekCache {
  readonly #views = new Map<string, Map<string, PeekView>>()

  get(source: vscode.Uri, key: string): PeekView | undefined {
    return this.#views.get(source.toString())?.get(key)
  }

  set(source: vscode.Uri, key: string, view: PeekView): void {
    const views = this.#views.get(source.toString()) ?? new Map<string, PeekView>()
    this.#views.set(source.toString(), views.set(key, view))
  }

  forget(source: vscode.Uri): void {
    this.#views.delete(source.toString())
  }
}

export interface PeekContext extends TableContext {
  readonly peeks: PeekCache
}

// The row the link of a cell points at, a few of its columns, read through the guards on the
// session of the panel; why it cannot be shown otherwise.
export async function peekLink(
  context: PeekContext,
  source: vscode.Uri,
  request: PeekRequest,
): Promise<PeekView> {
  const peeked = peekedRow(request)
  if (peeked === undefined) {
    return problem(NOWHERE)
  }
  const cacheKey = JSON.stringify([peeked.table, peeked.key])
  const cached = context.peeks.get(source, cacheKey)
  if (cached !== undefined) {
    return cached
  }
  if (context.runner.isRunning(source)) {
    return problem(BUSY, peeked.title)
  }
  const view = await readPeek(context, source, peeked)
  context.peeks.set(source, cacheKey, view)
  return view
}

interface PeekedRow {
  readonly title: string
  readonly table: ObjectRef
  readonly key: KeyMatch
}

// The row a cell points at, and how the popup names it; undefined for a NULL.
function peekedRow({ tab, row, column }: PeekRequest): PeekedRow | undefined {
  const link = linkAt(tab.meta.links, column)
  const values = tab.viewRow(row)
  if (link === undefined || values === undefined) {
    return undefined
  }
  const key = linkKey(link, values)
  const table = link.foreignKey.target
  return key === undefined
    ? undefined
    : { title: `${tableLabel(table, tab.meta.home)} ${keyText(key)}`, table, key }
}

function problem(text: string, title = ''): PeekView {
  return { title, columns: [], values: [], problem: text }
}

async function readPeek(
  context: PeekContext,
  source: vscode.Uri,
  peeked: PeekedRow,
): Promise<PeekView> {
  const outcomes = await readThroughGuards(context.runner, source, async (target) => {
    const parameterTypes = await parameterTypesOf(context, target, peeked.table)
    const query = tableRowQuery({ ...peeked, parameterTypes }, target.engine.dialect)
    return [{ ...query, maxRows: 1 }]
  })
  return viewOf(outcomes?.at(0), peeked.title)
}

function viewOf(outcome: ReadOutcome | undefined, title: string): PeekView {
  if (outcome === undefined) {
    return problem('sqldoro did not read the row.', title)
  }
  if ('problem' in outcome) {
    return problem(outcome.problem, title)
  }
  const { columns, rows } = outcome.result
  const [first] = rows
  return first === undefined
    ? problem(GONE, title)
    : {
        title,
        columns: columns.slice(0, PEEK_COLUMNS).map(({ name }) => name),
        values: first
          .slice(0, PEEK_COLUMNS)
          .map((value) => previewCell(value, PEEK_CELL_LENGTH).value),
        problem: '',
      }
}
