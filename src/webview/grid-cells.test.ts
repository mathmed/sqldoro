import { describe, expect, it } from 'vitest'

import { ColumnKind } from '../core/engine/query.ts'
import type { RowEdit } from './edit-overlay.ts'
import { cellDisplay, cellNote, type CellState, rowClassName } from './grid-cells.ts'

const ROW = { cells: [7, 'ann', 'x'.repeat(5)], truncated: [2] }
const MARKS = { isInSelection: false, isFocus: false }

function cell(column: number, edit?: RowEdit, kind: ColumnKind = ColumnKind.Text): CellState {
  return { position: { row: 0, column }, kind, row: ROW, edit }
}

function editOf(look: RowEdit['look'], changes: Partial<RowEdit> = {}): RowEdit {
  return { look, cells: new Map(), problem: '', ...changes }
}

describe('rowClassName', () => {
  it.each([
    [ROW, undefined, 'grid-row'],
    [undefined, undefined, 'grid-row loading'],
    [ROW, editOf('changed'), 'grid-row row-changed'],
    [undefined, editOf('added'), 'grid-row row-added'],
    [ROW, editOf('deleted', { problem: 'It changed.' }), 'grid-row row-deleted has-problem'],
  ])('should name %j with %j %s', (row, rowEdit, className) => {
    expect(rowClassName(row, rowEdit)).toBe(className)
  })
})

describe('cellDisplay', () => {
  it('should show the value of the row, with a mark when it was cut', () => {
    expect(cellDisplay(cell(1), MARKS)).toStrictEqual({
      className: 'grid-cell look-text',
      text: 'ann',
    })
    expect(cellDisplay(cell(2), MARKS).text).toBe('xxxxx…')
    expect(cellDisplay(cell(0, undefined, ColumnKind.Number), MARKS)).toStrictEqual({
      className: 'grid-cell look-number',
      text: '7',
    })
    expect(cellDisplay({ ...cell(0), row: undefined }, MARKS)).toStrictEqual({
      className: 'grid-cell look-loading',
      text: '',
    })
  })

  it('should show the new value of a changed cell, NULL and DEFAULT as words', () => {
    const changed = editOf('changed', {
      cells: new Map([
        [0, { kind: 'text', text: '' }],
        [1, { kind: 'null' }],
        [2, { kind: 'default' }],
      ]),
    })

    expect(cellDisplay(cell(0, changed), MARKS)).toStrictEqual({
      className: 'grid-cell look-empty pending',
      text: 'empty',
    })
    expect(cellDisplay(cell(1, changed), MARKS)).toStrictEqual({
      className: 'grid-cell look-null pending',
      text: 'NULL',
    })
    expect(cellDisplay(cell(2, changed), MARKS)).toStrictEqual({
      className: 'grid-cell look-default pending',
      text: 'DEFAULT',
    })
  })

  it('should show the default of a cell a new row left alone, and mark the selection and the focus', () => {
    expect(
      cellDisplay(
        { ...cell(1, editOf('added')), row: undefined },
        { isInSelection: true, isFocus: true },
      ),
    ).toEqual({
      className: 'grid-cell look-default selected focused',
      text: 'DEFAULT',
    })
  })
})

describe('cellNote', () => {
  it.each([
    [cell(1), undefined],
    [cell(1, editOf('changed', { cells: new Map([[1, { kind: 'null' }]]) })), 'changed'],
    [cell(0, editOf('changed', { cells: new Map([[1, { kind: 'null' }]]) })), undefined],
    [
      cell(1, editOf('added', { cells: new Map([[1, { kind: 'null' }]]) })),
      'changed, in a new row',
    ],
    [cell(1, editOf('deleted')), 'in a row marked for deletion'],
  ])('should say what %j is', (state, note) => {
    expect(cellNote(state)).toBe(note)
  })
})
