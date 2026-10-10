// Rows and lookups shared by the tests of the result grid.
import { fireEvent, screen, within } from '@testing-library/react'

import type { WireRow } from '../../src/core/results/protocol.ts'

export const LONG_TEXT = 'a'.repeat(1000)

export const GRID_ROWS: readonly WireRow[] = [
  { cells: ['1', 'ann'], truncated: [] },
  { cells: ['2', null], truncated: [] },
  { cells: ['3', ''], truncated: [] },
  { cells: ['4', LONG_TEXT], truncated: [1] },
]

// The cell of the first result tab at a row and a column, as the grid renders it.
export function cellAt(row: number, column: number): HTMLElement {
  const found = document.getElementById(`cell-tab-1-${String(row)}-${String(column)}`)
  if (found === null) {
    throw new Error(`no cell ${String(row)},${String(column)}`)
  }
  return found
}

export function theGrid(): HTMLElement {
  return screen.getByRole('grid')
}

export function buttonIn(group: string, name: string): HTMLButtonElement {
  return within(screen.getByRole('group', { name: group })).getByRole('button', { name })
}

// Opens the menu of a button, then picks one of its items.
export function pickFromMenu(button: string, item: string): void {
  fireEvent.click(screen.getByRole('button', { name: button }))
  fireEvent.click(
    within(screen.getByRole('menu', { name: button })).getByRole('menuitem', { name: item }),
  )
}
