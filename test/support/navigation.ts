// sales.orders opened from the explorer, with a foreign key to sales.notes and the foreign key of
// sales.lines pointing at it, over the table harness: what the result view sends to navigate, peek
// and count, and what the panels post back.
import { expect, vi } from 'vitest'

import type { ForeignKeyInfo, ReferenceInfo } from '../../src/core/engine/catalog.ts'
import { ColumnKind, type QueryRequest } from '../../src/core/engine/query.ts'
import type { FakeWebviewPanel } from '../vscode.ts'
import { webviewPanels } from '../vscode.ts'
import { answerOrders } from './edits.ts'
import { type Answer, placeKey } from './sessions.ts'
import {
  openTable,
  ORDERS_REF,
  type TableHarness,
  tableHarness,
  type TableResult,
} from './tables.ts'

const NOTE_FK: ForeignKeyInfo = {
  name: 'orders_note',
  columns: ['note'],
  referencedSchema: 'sales',
  referencedTable: 'notes',
  referencedColumns: ['text'],
  onUpdate: 'NO ACTION',
  onDelete: 'NO ACTION',
}
export const LINES_REFERENCE: ReferenceInfo = {
  name: 'lines_order',
  schema: 'sales',
  table: 'lines',
  columns: ['order_id'],
  referencedColumns: ['id'],
}
const TEXT = { dataType: 'TEXT', kind: ColumnKind.Text }
const NOTE_ROW: Answer = {
  columns: [
    { name: 'text', ...TEXT },
    { name: 'description', ...TEXT },
  ],
  rows: [['gift', 'A present']],
}
const COUNT: Answer = {
  columns: [{ name: 'count', dataType: 'INT8', kind: ColumnKind.Number }],
  rows: [['3']],
}
// Row 0 has no note (NULL); row 1 notes 'gift'.
export const NOTE_COLUMN = 2

export interface Relations {
  readonly foreignKeys?: readonly ForeignKeyInfo[]
  readonly references?: readonly ReferenceInfo[]
  // Answers before those of the orders, the notes and the counts.
  readonly answers?: (request: QueryRequest) => Answer | undefined
}

export interface NavigationHarness {
  readonly harness: TableHarness
  readonly orders: TableResult
  // What the result view of the orders sends, on the view the tab shows.
  readonly send: (message: Record<string, unknown>) => void
  readonly sent: () => QueryRequest[]
  // Waits until this many statements ran and the orders panel runs nothing.
  readonly settled: (count: number) => Promise<void>
}

function navigationAnswer(request: QueryRequest): Answer | undefined {
  if (request.sql.includes('COUNT(*)')) {
    return COUNT
  }
  return request.sql.includes('"notes"') ? NOTE_ROW : undefined
}

// Opens the orders once the catalog says what links them, and waits until the view knows.
export async function navigationHarness(relations: Relations = {}): Promise<NavigationHarness> {
  const { foreignKeys = [NOTE_FK], references = [LINES_REFERENCE], answers } = relations
  const harness = await tableHarness()
  answerOrders(harness, (request) => answers?.(request) ?? navigationAnswer(request))
  harness.engine.foreignKeys.set(placeKey(ORDERS_REF), foreignKeys)
  harness.engine.references.set(placeKey(ORDERS_REF), references)
  const orders = await openTable(harness)
  await vi.waitFor(() => {
    expect(orders.tab.meta.links).toHaveLength(foreignKeys.length)
  })
  const sent = (): QueryRequest[] => harness.engine.requests
  return {
    harness,
    orders,
    sent,
    send: (message) => {
      orders.panel.webview.send({
        tabId: orders.tab.id,
        viewVersion: orders.tab.viewVersion,
        ...message,
      })
    },
    settled: async (count) => {
      await vi.waitFor(() => {
        expect(sent().length).toBeGreaterThanOrEqual(count)
      })
      await vi.waitFor(() => {
        expect(harness.runner.isRunning(orders.uri)).toBe(false)
      })
    },
  }
}

export function postedOf(panel: FakeWebviewPanel, type: string): Record<string, unknown>[] {
  return (panel.webview.posted as Record<string, unknown>[]).filter(
    (message) => message['type'] === type,
  )
}

export function lastPanel(): FakeWebviewPanel {
  const panel = webviewPanels.at(-1)
  if (panel === undefined) {
    throw new Error('no panel')
  }
  return panel
}
