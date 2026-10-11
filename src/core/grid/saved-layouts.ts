import type { ObjectRef } from '../engine/catalog.ts'
import { readRecord, readString, readStrings } from '../json/record.ts'
import type { ListFormat } from '../json/versioned-list.ts'
import { type ColumnLayout, DEFAULT_LAYOUT, isDefaultLayout } from './column-layout.ts'

// The columns the grid shows for a table of a connection, kept for the next time its rows open.
export interface SavedLayout {
  readonly connectionId: string
  readonly table: ObjectRef
  readonly layout: ColumnLayout
}

// The layouts of this many tables are kept: the oldest go first.
export const MAX_SAVED_LAYOUTS = 500

export const SAVED_LAYOUT_FORMAT: ListFormat<SavedLayout> = {
  version: 1,
  key: 'layouts',
  listName: 'column layouts',
  entryName: 'Column layout',
  decode: (value) => {
    const record = readRecord(value)
    return {
      connectionId: readString(record, 'connectionId'),
      table: {
        database: readString(record, 'database'),
        schema: readString(record, 'schema'),
        name: readString(record, 'name'),
      },
      layout: { order: readStrings(record, 'order'), hidden: readStrings(record, 'hidden') },
    }
  },
  migrations: new Map(),
}

// What is stored of a layout: flat, as the format reads it back.
export function storedLayout({ connectionId, table, layout }: SavedLayout): unknown {
  return { connectionId, ...table, ...layout }
}

function isSameTable(saved: SavedLayout, connectionId: string, table: ObjectRef): boolean {
  return (
    saved.connectionId === connectionId && JSON.stringify(saved.table) === JSON.stringify(table)
  )
}

export function layoutFor(
  saved: readonly SavedLayout[],
  connectionId: string,
  table: ObjectRef,
): ColumnLayout {
  return saved.find((entry) => isSameTable(entry, connectionId, table))?.layout ?? DEFAULT_LAYOUT
}

// The layouts with this one last (the most recent); a layout that changes nothing is not kept.
export function withSavedLayout(
  saved: readonly SavedLayout[],
  entry: SavedLayout,
): readonly SavedLayout[] {
  const others = saved.filter((kept) => !isSameTable(kept, entry.connectionId, entry.table))
  const all = isDefaultLayout(entry.layout) ? others : [...others, entry]
  return all.slice(-MAX_SAVED_LAYOUTS)
}

// The layouts of connections that no longer exist go with them.
export function retainLayouts(
  saved: readonly SavedLayout[],
  connectionIds: ReadonlySet<string>,
): readonly SavedLayout[] {
  return saved.filter((entry) => connectionIds.has(entry.connectionId))
}
