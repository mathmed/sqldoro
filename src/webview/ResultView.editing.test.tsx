import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  editingView,
  focused,
  gridRow,
  hasEditor,
  setEdit,
  theEditor,
} from '../../test/webview/editing.ts'
import { cellAt, LONG_TEXT, theGrid } from '../../test/webview/grid.ts'

describe('ResultView, editing a cell', () => {
  it('should edit a cell opened with a double click, and put the value in with Enter', () => {
    const { sent } = editingView()

    fireEvent.doubleClick(cellAt(0, 1))
    expect(theEditor().value).toBe('ann')
    expect(theEditor().getAttribute('aria-label')).toBe('New value of name')
    fireEvent.change(theEditor(), { target: { value: 'bob' } })
    fireEvent.keyDown(theEditor(), { key: 'Enter' })

    expect(sent('edit')).toStrictEqual([setEdit(0, 1, 'bob')])
    expect(hasEditor()).toBe(false)
    expect(document.activeElement).toBe(theGrid())
    expect(focused()).toBe('cell-tab-1-0-1')
    expect(screen.queryByLabelText('Value of name')).toBeNull()
  })

  it('should start editing from the keyboard: Enter from the value, a character from itself', () => {
    const { sent } = editingView()
    fireEvent.mouseDown(cellAt(0, 0))

    fireEvent.keyDown(theGrid(), { key: 'Enter' })
    expect(theEditor().value).toBe('1')
    fireEvent.keyDown(theEditor(), { key: 'Escape' })
    fireEvent.keyDown(theGrid(), { key: '7' })
    expect(theEditor().value).toBe('7')
    fireEvent.keyDown(theEditor(), { key: 'Enter' })

    expect(sent('edit')).toStrictEqual([setEdit(0, 0, '7')])
  })

  it('should keep a value the column cannot hold in the editor, and say why', () => {
    const { sent } = editingView()
    fireEvent.mouseDown(cellAt(2, 0))
    fireEvent.doubleClick(cellAt(2, 0))

    fireEvent.change(theEditor(), { target: { value: '1.5' } })
    fireEvent.keyDown(theEditor(), { key: 'Enter' })
    fireEvent.keyDown(theEditor(), { key: 'Tab' })

    expect(screen.getByRole('alert').textContent).toBe(
      'Type a whole number from -2147483648 to 2147483647.',
    )
    expect(theEditor().value).toBe('1.5')
    expect(focused()).toBe('cell-tab-1-2-0')
    expect(sent('edit')).toStrictEqual([])
  })

  it('should leave the cell as it was with Escape, or with nothing typed', () => {
    const { sent } = editingView()

    fireEvent.doubleClick(cellAt(0, 1))
    fireEvent.change(theEditor(), { target: { value: 'bob' } })
    fireEvent.keyDown(theEditor(), { key: 'Escape' })
    fireEvent.doubleClick(cellAt(0, 1))
    fireEvent.keyDown(theEditor(), { key: 'Enter' })

    expect(sent('edit')).toStrictEqual([])
    expect(hasEditor()).toBe(false)
    expect(cellAt(0, 1).textContent).toBe('ann')
  })

  it('should move along the row with Tab and Shift+Tab, inside its columns', () => {
    editingView()

    const moves = [
      [0, {}, 'cell-tab-1-2-1'],
      [1, {}, 'cell-tab-1-2-1'],
      [1, { shiftKey: true }, 'cell-tab-1-2-0'],
      [0, { shiftKey: true }, 'cell-tab-1-2-0'],
    ] as const
    for (const [column, modifiers, cell] of moves) {
      fireEvent.doubleClick(cellAt(2, column))
      fireEvent.keyDown(theEditor(), { key: 'Tab', ...modifiers })
      expect(focused()).toBe(cell)
    }
  })

  it('should start a NULL cell empty, and a cut one from its whole value', () => {
    const { rerender, sent } = editingView()

    fireEvent.doubleClick(cellAt(1, 1))
    expect(theEditor().value).toBe('')
    fireEvent.keyDown(theEditor(), { key: 'Escape' })
    expect(sent('fetchCell')).toStrictEqual([])

    fireEvent.doubleClick(cellAt(3, 1))
    expect(screen.getByText('Loading…')).toBeDefined()
    expect(sent('fetchCell')).toStrictEqual([
      { type: 'fetchCell', tabId: 'tab-1', viewVersion: 0, row: 3, column: 1 },
    ])
    const place = { tabId: 'tab-1', viewVersion: 0, row: 3, column: 1 }
    rerender({ cell: { type: 'cell', ...place, value: `${LONG_TEXT}!` } })

    expect(theEditor().value).toBe(`${LONG_TEXT}!`)
  })

  it('should start a changed cell from its new value', () => {
    const { sent } = editingView({
      editing: {
        rows: [
          {
            row: 0,
            isDeleted: false,
            cells: [
              { column: 0, value: { kind: 'null' } },
              { column: 1, value: { kind: 'text', text: 'carl' } },
            ],
            problem: '',
          },
        ],
      },
    })
    expect(cellAt(0, 1).textContent).toBe('carl')
    expect(cellAt(0, 1).className).toBe('grid-cell look-text pending')
    expect(cellAt(0, 1).getAttribute('aria-description')).toBe('changed')
    expect(gridRow(0)?.className).toBe('grid-row row-changed')

    fireEvent.doubleClick(cellAt(0, 1))
    expect(theEditor().value).toBe('carl')
    fireEvent.keyDown(theEditor(), { key: 'Escape' })
    fireEvent.doubleClick(cellAt(0, 0))
    expect(theEditor().value).toBe('')

    expect(sent('fetchCell')).toStrictEqual([])
  })

  it.each([
    { changes: { viewVersion: 1 } },
    { editing: { state: 'applying' } },
    { editing: { rows: [{ row: 0, isDeleted: true, cells: [], problem: '' }] } },
  ] as const)('should close the editor for good once its cell takes no value: %j', (closing) => {
    const { rerender, sent } = editingView()
    fireEvent.doubleClick(cellAt(0, 1))
    fireEvent.change(theEditor(), { target: { value: 'bob' } })

    rerender(closing)
    expect(hasEditor()).toBe(false)
    rerender({})

    expect(hasEditor()).toBe(false)
    expect(sent('edit')).toStrictEqual([])
  })

  it('should put the value of an enum picked from its list in at once', () => {
    const { sent } = editingView({
      editing: {
        columns: [
          { type: 'integer', min: '0', max: '9' },
          { type: 'choice', options: ['ann', 'bob'], isMultiple: false },
        ],
      },
    })
    fireEvent.doubleClick(cellAt(0, 1))

    fireEvent.click(screen.getByRole('option', { name: 'bob' }))

    expect(sent('edit')).toStrictEqual([setEdit(0, 1, 'bob')])
    expect(focused()).toBe('cell-tab-1-0-1')
  })
})
