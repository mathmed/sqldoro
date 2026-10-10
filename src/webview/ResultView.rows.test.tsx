import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { editingView, gridRow, hasEditor, setEdit, theEditor } from '../../test/webview/editing.ts'
import { buttonIn, cellAt, theGrid } from '../../test/webview/grid.ts'
import { ValueType } from '../core/engine/table.ts'
import type { EditPreview } from '../core/results/protocol.ts'

const PREVIEW: EditPreview = {
  id: 3,
  summary: '1 change to sales.orders',
  statements: [
    { sql: 'DELETE FROM t WHERE id = $1', values: ['1'], expectedRows: 1, label: 'Row 1' },
  ],
  deletions: 1,
  isInOpenTransaction: false,
}

describe('ResultView, editing the rows', () => {
  it('should show the rows added in the grid after the rows of the view, and edit them', () => {
    const { sent } = editingView({
      editing: {
        newRows: [
          { id: 1, cells: [{ column: 1, value: { kind: 'text', text: 'dan' } }], problem: '' },
          { id: 2, cells: [], problem: 'The column id needs a value.' },
        ],
      },
    })

    expect(theGrid().getAttribute('aria-rowcount')).toBe('7')
    expect(
      [4, 5].map((row) => [cellAt(row, 0).textContent, cellAt(row, 1).textContent]),
    ).toStrictEqual([
      ['DEFAULT', 'dan'],
      ['DEFAULT', 'DEFAULT'],
    ])
    expect(gridRow(4)?.className).toBe('grid-row row-added')
    expect(gridRow(4)?.hasAttribute('title')).toBe(false)
    expect(gridRow(5)?.className).toBe('grid-row row-added has-problem')
    expect(gridRow(5)?.getAttribute('title')).toBe('The column id needs a value.')
    expect(cellAt(5, 0).getAttribute('aria-description')).toBe('in a new row')

    fireEvent.doubleClick(cellAt(5, 0))
    expect(theEditor().value).toBe('')
    fireEvent.change(theEditor(), { target: { value: '9' } })
    fireEvent.keyDown(theEditor(), { key: 'Enter' })

    expect(sent('edit')).toStrictEqual([setEdit(5, 0, '9')])
    expect(sent('fetchCell')).toStrictEqual([])
  })

  it('should show the whole value of cells that take none: read-only columns, rows to delete', () => {
    editingView({
      editing: {
        columns: [
          { type: ValueType.Integer, min: '0', max: '9' },
          { type: ValueType.ReadOnly, reason: 'Binary.' },
        ],
        rows: [{ row: 1, isDeleted: true, cells: [], problem: '' }],
      },
    })

    expect(theGrid().getAttribute('aria-readonly')).toBe('false')
    expect(cellAt(0, 1).getAttribute('aria-readonly')).toBe('true')
    expect(cellAt(0, 0).getAttribute('aria-readonly')).toBe('false')
    expect(cellAt(1, 0).getAttribute('aria-readonly')).toBe('true')
    expect(gridRow(1)?.className).toBe('grid-row row-deleted')
    fireEvent.doubleClick(cellAt(0, 1))
    expect(screen.getByLabelText('Value of name').textContent).toContain('ann')
    fireEvent.doubleClick(cellAt(1, 0))
    expect(screen.getByLabelText('Value of id').textContent).toContain('2')
    for (const [row, column] of [
      [0, 1],
      [1, 0],
    ] as const) {
      fireEvent.mouseDown(cellAt(row, column))
      fireEvent.keyDown(theGrid(), { key: 'x' })
      fireEvent.keyDown(theGrid(), { key: 'F2' })
    }

    expect(hasEditor()).toBe(false)
  })

  it('should mark the selected rows for deletion with Delete, and preview the changes with Ctrl+S', () => {
    const { sent } = editingView()
    fireEvent.keyDown(theGrid(), { key: 'Delete' })
    expect(sent('edit')).toStrictEqual([])

    fireEvent.mouseDown(cellAt(1, 1))
    fireEvent.mouseDown(cellAt(2, 0), { shiftKey: true })
    fireEvent.keyDown(theGrid(), { key: 'Delete' })
    fireEvent.keyDown(theGrid(), { key: 's', metaKey: true })

    const range = { firstRow: 1, lastRow: 2, firstColumn: 0, lastColumn: 1 }
    expect(sent('edit')).toStrictEqual([
      { type: 'edit', tabId: 'tab-1', viewVersion: 0, edit: { kind: 'delete', range, input: '' } },
    ])
    expect(sent('previewEdits')).toStrictEqual([{ type: 'previewEdits', tabId: 'tab-1' }])
  })

  it('should neither delete nor preview while the rows cannot be edited', () => {
    const { sent } = editingView({ editing: { state: 'readOnly', problem: 'It joins tables.' } })
    fireEvent.mouseDown(cellAt(1, 1))

    fireEvent.keyDown(theGrid(), { key: 'Delete' })
    fireEvent.keyDown(theGrid(), { key: 's', ctrlKey: true })
    fireEvent.keyDown(theGrid(), { key: 'Enter' })

    expect(sent('edit')).toStrictEqual([])
    expect(sent('previewEdits')).toStrictEqual([])
    expect(theGrid().getAttribute('aria-readonly')).toBe('true')
    expect(cellAt(1, 1).hasAttribute('aria-readonly')).toBe(false)
    expect(screen.getByLabelText('Value of name')).toBeDefined()
  })

  it('should send the edits of the bar on the selection, or on the whole result', () => {
    const { sent } = editingView({ editing: { hiddenRows: 1 } })
    fireEvent.mouseDown(cellAt(0, 0))
    fireEvent.mouseDown(cellAt(1, 1), { shiftKey: true })

    fireEvent.click(buttonIn('Cells', 'Set NULL'))
    fireEvent.click(buttonIn('Rows', 'Add Row'))

    const range = { firstRow: 0, lastRow: 1, firstColumn: 0, lastColumn: 1 }
    expect(sent('edit')).toStrictEqual([
      { type: 'edit', tabId: 'tab-1', viewVersion: 0, edit: { kind: 'setNull', range, input: '' } },
      {
        type: 'edit',
        tabId: 'tab-1',
        viewVersion: 0,
        edit: { kind: 'insert', range: null, input: '' },
      },
    ])
  })

  it('should apply the preview it shows, or close it', () => {
    const { sent } = editingView({
      editing: { preview: PREVIEW, rows: [{ row: 0, isDeleted: true, cells: [], problem: '' }] },
      connection: { name: 'Shop', environment: 'prod', isProduction: true, isReadOnly: false },
    })
    expect(within(screen.getByRole('dialog')).getByRole('note').textContent).toBe(
      'Production: PROD · Shop · writes allowed',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apply 1 Statement' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(sent('applyEdits')).toStrictEqual([{ type: 'applyEdits', tabId: 'tab-1', previewId: 3 }])
    expect(sent('closePreview')).toStrictEqual([{ type: 'closePreview', tabId: 'tab-1' }])
  })

  it('should copy the selected rows whole as INSERT statements', () => {
    const { sent } = editingView()
    fireEvent.mouseDown(cellAt(2, 1))
    fireEvent.mouseDown(cellAt(3, 1), { shiftKey: true })

    fireEvent.click(screen.getByRole('button', { name: 'Copy Rows as INSERT' }))

    expect(sent('copy')).toStrictEqual([
      {
        type: 'copy',
        tabId: 'tab-1',
        viewVersion: 0,
        range: { firstRow: 2, lastRow: 3, firstColumn: 0, lastColumn: 1 },
        format: 'sql',
      },
    ])
  })

  it('should keep its rows while they are read again, and take the new count after', () => {
    const { rerender } = editingView()

    rerender({ changes: { status: 'running', rowCount: 0, loadedRows: 0, summary: null } })
    expect(screen.getAllByRole('row')).toHaveLength(6)

    rerender({ changes: { rowCount: 2, loadedRows: 2 } })
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })
})
