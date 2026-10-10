import { plural } from '../results/tabs.ts'

// Deleting rows is confirmed apart, with their number: by typing it on production, by a button
// elsewhere.
export interface DeletionConfirmation {
  readonly isTyped: boolean
  readonly title: string
  readonly prompt: string
  // What to type, or the button that confirms.
  readonly expected: string
}

export interface DeletionTarget {
  readonly table: string
  readonly connection: string
  readonly isProduction: boolean
}

// Undefined when the changes delete no row.
export function deletionConfirmation(
  count: number,
  target: DeletionTarget,
): DeletionConfirmation | undefined {
  if (count === 0) {
    return undefined
  }
  const rows = plural(count, 'row', 'rows')
  const title = `Delete ${rows} of ${target.table}`
  return target.isProduction
    ? {
        isTyped: true,
        title,
        prompt: `"${target.connection}" is production and the changes delete ${rows} of ${target.table}. Type ${String(count)} to delete ${count === 1 ? 'it' : 'them'}.`,
        expected: String(count),
      }
    : {
        isTyped: false,
        title,
        prompt: `The changes delete ${rows} of ${target.table} on "${target.connection}".`,
        expected: `Delete ${plural(count, 'Row', 'Rows')}`,
      }
}
