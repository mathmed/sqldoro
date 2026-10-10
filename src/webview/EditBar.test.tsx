import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { editableTab, resultTab } from '../../test/fixtures/results.ts'
import { buttonIn } from '../../test/webview/grid.ts'
import type { PendingRow, TabEditing } from '../core/results/protocol.ts'
import type { EditActions } from './edit-messages.ts'
import { EditBar } from './EditBar.tsx'

const CHANGED_ROW: PendingRow = {
  row: 0,
  isDeleted: false,
  cells: [{ column: 1, value: { kind: 'null' } }],
  problem: '',
}
const BUTTONS = [
  ['Rows', 'Add Row'],
  ['Rows', 'Duplicate'],
  ['Rows', 'Delete'],
  ['Cells', 'Set NULL'],
  ['Cells', 'Set Default'],
  ['Cells', 'Revert'],
  ['Changes', 'Revert All'],
  ['Changes', 'Preview Changes…'],
] as const

function editActions(): EditActions {
  return {
    onSelection: vi.fn(),
    onResult: vi.fn(),
    preview: vi.fn(),
    closePreview: vi.fn(),
    apply: vi.fn(),
  }
}

function renderBar(
  editing: Partial<TabEditing>,
  { hasSelection = false, sut = editActions() } = {},
): EditActions {
  render(<EditBar tab={editableTab(editing)} hasSelection={hasSelection} actions={sut} />)
  return sut
}

function status(): string | null {
  return screen.getByRole('region', { name: 'Editing' }).firstElementChild?.textContent ?? null
}

function enabledButtons(): string[] {
  return BUTTONS.filter(([group, name]) => !buttonIn(group, name).disabled).map(([, name]) => name)
}

describe('EditBar', () => {
  it('should not show while there is nothing to edit', () => {
    render(<EditBar tab={resultTab()} hasSelection={false} actions={editActions()} />)

    expect(screen.queryByRole('region', { name: 'Editing' })).toBeNull()
  })

  it.each([
    [{ state: 'checking' }, 'Checking whether these rows can be edited…'],
    [
      { state: 'readOnly', problem: 'The query joins tables.' },
      'Read-only: The query joins tables.',
    ],
  ] as const)('should say %j without buttons', (editing, text) => {
    renderBar(editing)

    expect(status()).toBe(text)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('should name the table and its key, and offer what needs no selection', () => {
    renderBar({ key: ['region', 'id'] })

    expect(status()).toBe('Editing sales.orders, rows told apart by region, id')
    expect(enabledButtons()).toStrictEqual(['Add Row'])
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
    expect(enabledButtons()).toStrictEqual(['Add Row', 'Revert All', 'Preview Changes…'])
  })

  it('should count a single changed row', () => {
    renderBar({ rows: [CHANGED_ROW] })
    expect(status()).toBe('Editing sales.orders, rows told apart by id · 1 changed row')
  })

  it('should offer the changes of hidden rows', () => {
    renderBar({ hiddenRows: 1 })

    expect(status()).toBe(
      'Editing sales.orders, rows told apart by id · 1 changed row, 1 hidden by the filters',
    )
    expect(buttonIn('Changes', 'Preview Changes…').disabled).toBe(false)
  })

  it('should send each edit on the selection, or on the whole result', () => {
    const sut = renderBar({ rows: [CHANGED_ROW] }, { hasSelection: true })
    expect(enabledButtons()).toStrictEqual(BUTTONS.map(([, name]) => name))

    for (const [group, name] of BUTTONS) {
      fireEvent.click(buttonIn(group, name))
    }

    expect(vi.mocked(sut.onSelection).mock.calls).toStrictEqual([
      ['duplicate'],
      ['delete'],
      ['setNull'],
      ['setDefault'],
      ['revert'],
    ])
    expect(vi.mocked(sut.onResult).mock.calls).toStrictEqual([['insert'], ['revertAll']])
    expect(sut.preview).toHaveBeenCalledOnce()
  })

  it('should say why rows cannot be added', () => {
    renderBar({ insertProblem: 'The column note has no default.' }, { hasSelection: true })

    for (const name of ['Add Row', 'Duplicate']) {
      expect(buttonIn('Rows', name).disabled).toBe(true)
      expect(buttonIn('Rows', name).title).toBe('The column note has no default.')
    }
    expect(buttonIn('Rows', 'Delete').disabled).toBe(false)
    expect(buttonIn('Rows', 'Delete').hasAttribute('title')).toBe(false)
  })

  it('should disable every button while the changes apply', () => {
    renderBar({ state: 'applying', rows: [CHANGED_ROW] }, { hasSelection: true })

    expect(status()).toBe('Applying the changes to sales.orders…')
    expect(enabledButtons()).toStrictEqual([])
  })

  it('should say what the last edit or apply said, an error as such', () => {
    const { unmount } = render(
      <EditBar
        tab={editableTab({ notice: 'Applied 1 change.' })}
        hasSelection={false}
        actions={editActions()}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe('Applied 1 change.')
    expect(screen.getByRole('status').className).toBe('edit-notice')
    unmount()

    renderBar({ notice: 'Nothing was applied.', isNoticeError: true })
    expect(screen.getByRole('status').className).toBe('edit-notice error')
  })
})
