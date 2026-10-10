import { describe, expect, it } from 'vitest'

import { editableTab, resultTab } from '../../test/fixtures/results.ts'
import {
  canEditCell,
  cellSpec,
  gridRowCount,
  isEditing,
  pendingDisplay,
  pendingDraft,
  rowEditAt,
} from './edit-overlay.ts'

const TEXT = { kind: 'text', text: 'bob' } as const
const TAB = editableTab({
  rows: [
    { row: 1, isDeleted: false, cells: [{ column: 1, value: TEXT }], problem: 'It changed.' },
    { row: 2, isDeleted: true, cells: [], problem: '' },
  ],
  newRows: [{ id: 7, cells: [{ column: 0, value: { kind: 'null' } }], problem: '' }],
})

describe('edit overlay', () => {
  it('should count the rows added in the grid after the rows of the view', () => {
    expect(gridRowCount(TAB)).toBe(5)
    expect(gridRowCount(resultTab())).toBe(2)
  })

  it('should tell the changes of each row of the grid', () => {
    expect(rowEditAt(TAB, 0)).toBeUndefined()
    expect(rowEditAt(TAB, 1)).toStrictEqual({
      look: 'changed',
      cells: new Map([[1, TEXT]]),
      problem: 'It changed.',
    })
    expect(rowEditAt(TAB, 2)).toMatchObject({ look: 'deleted', cells: new Map() })
    expect(rowEditAt(TAB, 4)).toMatchObject({
      look: 'added',
      cells: new Map([[0, { kind: 'null' }]]),
    })
    expect(rowEditAt(TAB, 5)).toBeUndefined()
  })

  it('should edit only cells of columns that take values, outside deleted rows, while editing', () => {
    const readOnlyName = editableTab({
      columns: [
        { type: 'integer', min: '0', max: '9' },
        { type: 'readOnly', reason: 'Binary values are shown read-only.' },
      ],
    })

    expect(isEditing(TAB)).toBe(true)
    expect(isEditing(resultTab())).toBe(false)
    expect(cellSpec(TAB, { row: 0, column: 1 })).toStrictEqual({ type: 'text', maxLength: 10 })
    expect(cellSpec(TAB, { row: 2, column: 1 })).toBeUndefined()
    expect(cellSpec(readOnlyName, { row: 0, column: 1 })).toBeUndefined()
    expect(cellSpec(TAB, { row: 0, column: 5 })).toBeUndefined()
    expect(cellSpec(resultTab(), { row: 0, column: 0 })).toBeUndefined()
    expect(canEditCell(TAB, { row: 0, column: 1 })).toBe(true)
    expect(canEditCell(TAB, { row: 2, column: 1 })).toBe(false)
    expect(canEditCell(TAB, { row: 4, column: 1 })).toBe(true)
    expect(canEditCell(readOnlyName, { row: 0, column: 1 })).toBe(false)
  })

  it('should show pending values, NULL and DEFAULT as words', () => {
    expect(pendingDisplay(TEXT)).toStrictEqual({ text: 'bob', keyword: undefined })
    expect(pendingDisplay({ kind: 'null' })).toStrictEqual({ text: 'NULL', keyword: 'null' })
    expect(pendingDisplay({ kind: 'default' })).toStrictEqual({
      text: 'DEFAULT',
      keyword: 'default',
    })
    expect(pendingDisplay(undefined)).toStrictEqual({ text: 'DEFAULT', keyword: 'default' })
  })

  it('should start editing a pending cell from what was typed, or from nothing', () => {
    expect(pendingDraft(TEXT)).toBe('bob')
    expect(pendingDraft({ kind: 'null' })).toBe('')
    expect(pendingDraft({ kind: 'default' })).toBe('')
  })
})
