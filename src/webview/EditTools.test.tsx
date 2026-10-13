import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { editableTab, resultTab } from '../../test/fixtures/results.ts'
import { buttonIn, isOff } from '../../test/webview/grid.ts'
import type { PendingRow, TabEditing } from '../core/results/tab-editing.ts'
import type { EditActions } from './edit-messages.ts'
import { EditTools } from './EditTools.tsx'

const CHANGED_ROW: PendingRow = {
  row: 0,
  isDeleted: false,
  cells: [{ column: 1, value: { kind: 'null' } }],
  problem: '',
}
const BUTTONS = [
  ['Changes', 'Preview Changes… (Ctrl+S)'],
  ['Changes', 'Revert All Changes'],
  ['Rows', 'Add Row'],
  ['Rows', 'Duplicate Rows'],
  ['Rows', 'Delete Rows (Delete)'],
  ['Cells', 'Set to NULL'],
  ['Cells', 'Set to Default'],
  ['Cells', 'Revert Cells'],
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

function renderTools(
  editing: Partial<TabEditing>,
  { hasSelection = false, sut = editActions() } = {},
): EditActions {
  render(<EditTools tab={editableTab(editing)} hasSelection={hasSelection} actions={sut} />)
  return sut
}

function enabledButtons(): string[] {
  return BUTTONS.filter(([group, name]) => !isOff(buttonIn(group, name))).map(([, name]) => name)
}

describe('EditTools', () => {
  it.each([
    ['nothing to edit', resultTab().editing],
    ['rows being checked', { ...resultTab().editing, state: 'checking' }],
  ] as const)('should not show for %s', (...[, editing]) => {
    render(<EditTools tab={resultTab({ editing })} hasSelection actions={editActions()} />)

    expect(screen.queryByRole('group', { name: 'Rows' })).toBeNull()
  })

  it('should offer what needs no selection, and say what each button does', () => {
    renderTools({})

    expect(enabledButtons()).toStrictEqual(['Add Row'])
    expect(buttonIn('Rows', 'Add Row').title).toBe('Add Row')
    expect(buttonIn('Rows', 'Delete Rows (Delete)').title).toBe(
      'Delete Rows (Delete): select rows first',
    )
    expect(buttonIn('Cells', 'Set to NULL').title).toBe('Set to NULL: select cells first')
  })

  it('should offer the changes, those of hidden rows too', () => {
    renderTools({ hiddenRows: 1 })

    expect(enabledButtons()).toStrictEqual([
      'Preview Changes… (Ctrl+S)',
      'Revert All Changes',
      'Add Row',
    ])
  })

  it('should send each edit on the selection, or on the whole result', () => {
    const sut = renderTools({ rows: [CHANGED_ROW] }, { hasSelection: true })
    expect(enabledButtons()).toStrictEqual(BUTTONS.map(([, name]) => name))

    for (const [group, name] of BUTTONS) {
      fireEvent.click(buttonIn(group, name))
    }

    expect(sut.preview).toHaveBeenCalledOnce()
    expect(vi.mocked(sut.onSelection).mock.calls).toStrictEqual([
      ['duplicate'],
      ['delete'],
      ['setNull'],
      ['setDefault'],
      ['revert'],
    ])
    expect(vi.mocked(sut.onResult).mock.calls).toStrictEqual([['revertAll'], ['insert']])
  })

  it('should say why rows cannot be added', () => {
    renderTools({ insertProblem: 'The column note has no default.' }, { hasSelection: true })

    for (const name of ['Add Row', 'Duplicate Rows']) {
      expect(isOff(buttonIn('Rows', name))).toBe(true)
      expect(buttonIn('Rows', name).title).toBe(`${name}: The column note has no default.`)
    }
    expect(isOff(buttonIn('Rows', 'Delete Rows (Delete)'))).toBe(false)
  })

  it('should disable every button while the changes apply', () => {
    renderTools({ state: 'applying', rows: [CHANGED_ROW] }, { hasSelection: true })

    expect(enabledButtons()).toStrictEqual([])
  })

  it('should show the tools off for read-only rows, saying why', () => {
    render(
      <EditTools
        tab={editableTab({ state: 'readOnly', problem: 'The result has no key.' })}
        hasSelection
        actions={editActions()}
      />,
    )

    expect(enabledButtons()).toStrictEqual([])
    expect(buttonIn('Rows', 'Add Row').title).toBe('Add Row: read-only: The result has no key.')
    expect(buttonIn('Changes', 'Preview Changes… (Ctrl+S)').title).toBe(
      'Preview Changes… (Ctrl+S): read-only: The result has no key.',
    )
    expect(buttonIn('Changes', 'Revert All Changes').title).toBe(
      'Revert All Changes: read-only: The result has no key.',
    )
  })
})
