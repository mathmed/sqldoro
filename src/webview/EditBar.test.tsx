import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { editableTab, resultTab } from '../../test/fixtures/results.ts'
import type { PendingRow, ResultTab, TabEditing } from '../core/results/protocol.ts'
import { EditBar } from './EditBar.tsx'

const CHANGED_ROW: PendingRow = {
  row: 0,
  isDeleted: false,
  cells: [{ column: 1, value: { kind: 'null' } }],
  problem: '',
}

function renderBar(editing: Partial<TabEditing>, changes: Partial<ResultTab> = {}): void {
  render(<EditBar tab={editableTab(editing, changes)} />)
}

function status(): string | null {
  return screen.getByRole('region', { name: 'Editing' }).firstElementChild?.textContent ?? null
}

describe('EditBar', () => {
  it('should not show while there is nothing to edit', () => {
    render(<EditBar tab={resultTab()} />)

    expect(screen.queryByRole('region', { name: 'Editing' })).toBeNull()
  })

  it.each([
    [{ state: 'checking' }, 'Checking whether these rows can be edited…'],
    [
      { state: 'readOnly', problem: 'The query joins tables.' },
      'Read-only: The query joins tables.',
    ],
    [{ state: 'applying' }, 'Applying the changes to sales.orders…'],
  ] as const)('should say %j', (editing, text) => {
    renderBar(editing)

    expect(status()).toBe(text)
  })

  it('should name the table and its key', () => {
    renderBar({ key: ['region', 'id'] })

    expect(status()).toBe('Editing sales.orders, rows told apart by region, id')
  })

  it('should count the changed rows, those the filters hide too', () => {
    renderBar({
      rows: [CHANGED_ROW],
      newRows: [{ id: 1, cells: [], problem: '' }],
      hiddenRows: 2,
    })

    expect(status()).toBe(
      'Editing sales.orders, rows told apart by id · 4 changed rows, 2 hidden by the filters',
    )
  })

  it('should count a single changed row, and the rows the quick search hides', () => {
    renderBar({ rows: [CHANGED_ROW] })
    expect(status()).toBe('Editing sales.orders, rows told apart by id · 1 changed row')

    renderBar({ hiddenRows: 1 }, { search: 'ann' })
    expect(screen.getAllByRole('region', { name: 'Editing' }).at(-1)?.textContent).toBe(
      'Editing sales.orders, rows told apart by id · 1 changed row, 1 hidden by the filters or the search',
    )
  })

  it('should say what the last edit or apply said, an error as such', () => {
    const { unmount } = render(<EditBar tab={editableTab({ notice: 'Applied 1 change.' })} />)
    expect(screen.getByRole('status').textContent).toBe('Applied 1 change.')
    expect(screen.getByRole('status').className).toBe('edit-notice')
    unmount()

    renderBar({ notice: 'Nothing was applied.', isNoticeError: true })
    expect(screen.getByRole('status').className).toBe('edit-notice error')
  })
})
