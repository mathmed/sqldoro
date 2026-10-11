// Which columns of a result the grid shows, and in which order. Columns are named by their key (the
// name, with its occurrence when a name repeats), so that a layout chosen for a table still fits
// when its rows are read again, even if columns were added or dropped meanwhile.
export interface ColumnLayout {
  // The keys in the order the user put them; columns not in it follow, in their own order.
  readonly order: readonly string[]
  readonly hidden: readonly string[]
}

// A column of the result: its position and its key.
export interface KeyedColumn {
  readonly index: number
  readonly key: string
}

type Named = readonly { readonly name: string }[]

export const DEFAULT_LAYOUT: ColumnLayout = { order: [], hidden: [] }

const OCCURRENCE_MARK = '#'

// The key of each column: its name, or its name and occurrence (id#2) for a name seen before.
export function columnKeys(columns: Named): string[] {
  const seen = new Map<string, number>()
  return columns.map(({ name }) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count === 1 ? name : `${name}${OCCURRENCE_MARK}${String(count)}`
  })
}

// Every column in the order of the layout.
export function orderedColumns(columns: Named, layout: ColumnLayout): KeyedColumn[] {
  const keyed = columnKeys(columns).map((key, index) => ({ index, key }))
  const byKey = new Map(keyed.map((column) => [column.key, column]))
  const placed = [...new Set(layout.order)].flatMap((key) => {
    const column = byKey.get(key)
    return column === undefined ? [] : [column]
  })
  return [...placed, ...keyed.filter((column) => !placed.includes(column))]
}

// The columns the grid shows, as positions of the result, in the order of the layout.
export function shownColumns(columns: Named, layout: ColumnLayout): number[] {
  const hidden = new Set(layout.hidden)
  return orderedColumns(columns, layout)
    .filter(({ key }) => !hidden.has(key))
    .map(({ index }) => index)
}

// How many columns of the result the layout hides.
export function hiddenCount(columns: Named, layout: ColumnLayout): number {
  return columns.length - shownColumns(columns, layout).length
}

export function isDefaultLayout(layout: ColumnLayout): boolean {
  return layout.order.length === 0 && layout.hidden.length === 0
}

// The layout with these columns hidden or shown again.
export function withHidden(
  layout: ColumnLayout,
  keys: readonly string[],
  isHidden: boolean,
): ColumnLayout {
  const others = layout.hidden.filter((key) => !keys.includes(key))
  return { ...layout, hidden: isHidden ? [...others, ...keys] : others }
}

// Every column shown again; the order stays.
export function withNoneHidden(layout: ColumnLayout): ColumnLayout {
  return { ...layout, hidden: [] }
}

// Every one of these columns hidden; the order stays.
export function withAllHidden(keys: readonly string[], layout: ColumnLayout): ColumnLayout {
  return { ...layout, hidden: [...keys] }
}

// The hidden columns shown and the shown ones hidden.
export function withInverted(keys: readonly string[], layout: ColumnLayout): ColumnLayout {
  const hidden = new Set(layout.hidden)
  return { ...layout, hidden: keys.filter((key) => !hidden.has(key)) }
}

// The column moved to `target`, a position in the order of every column; the others keep theirs.
export function withMoved(
  columns: Named,
  layout: ColumnLayout,
  move: { readonly key: string; readonly target: number },
): ColumnLayout {
  const ordered = orderedColumns(columns, layout).map(({ key }) => key)
  if (!ordered.includes(move.key)) {
    return layout
  }
  const without = ordered.filter((key) => key !== move.key)
  const target = Math.min(Math.max(move.target, 0), without.length)
  return { ...layout, order: [...without.slice(0, target), move.key, ...without.slice(target)] }
}
