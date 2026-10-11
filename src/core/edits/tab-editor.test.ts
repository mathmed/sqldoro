import { describe, expect, it } from 'vitest'

import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { POSTGRES_ORDERS } from '../../../test/fixtures/edit-tables.ts'
import { ORDERS_RESULT } from '../../../test/fixtures/tables.ts'
import { ResultSet } from '../results/result-set.ts'
import { EditKind } from './edit-kind.ts'
import { NOT_EDITING, TabEditor } from './tab-editor.ts'

const SETTING = { dialect: POSTGRES_DIALECT, isInOpenTransaction: false }
const ROWS = [
  [1, 'A-1', null, '12.50', '{"a": 1}', '2026-01-02 03:04:05+00', 1250],
  [2, 'A-2', 'gift', null, null, '2026-01-03 03:04:05+00', null],
]

function rows(): ResultSet {
  const result = new ResultSet({
    values: [],
    id: 't',
    sql: 'SELECT * FROM sales.orders',
    kind: 'rows',
    canServerView: true,
    canRefresh: false,
  })
  result.describe(ORDERS_RESULT)
  result.addRows(ROWS)
  return result
}

function editable(): { readonly sut: TabEditor; readonly source: ResultSet } {
  const sut = new TabEditor()
  sut.finishCheck(sut.startCheck(), { table: POSTGRES_ORDERS })
  return { sut, source: rows() }
}

function setCellOf(
  sut: TabEditor,
  source: ResultSet,
  [row, column, input]: readonly [number, number, string],
): boolean {
  const block = { firstRow: row, lastRow: row, columns: [column] }
  return sut.act({ kind: EditKind.Set, block, input }, source)
}

function setNote(sut: TabEditor, source: ResultSet, input = 'x'): boolean {
  return setCellOf(sut, source, [1, 2, input])
}

describe('NOT_EDITING', () => {
  it('should say there is nothing to edit', () => {
    expect(NOT_EDITING).toStrictEqual({
      state: 'none',
      problem: '',
      table: '',
      key: [],
      columns: [],
      insertProblem: '',
      rows: [],
      newRows: [],
      hiddenRows: 0,
      preview: null,
      notice: '',
      isNoticeError: false,
    })
  })
})

describe('TabEditor', () => {
  it('should edit nothing until a check says the rows can be edited', () => {
    const sut = new TabEditor()

    expect(sut.toWire(rows())).toBe(NOT_EDITING)
    expect(setNote(sut, rows())).toBe(false)
    expect(sut.preview(rows(), SETTING)).toBe(false)
    expect(sut.hasChanges).toBe(false)
  })

  it('should say it is checking, then why the rows cannot be edited', () => {
    const sut = new TabEditor()
    const check = sut.startCheck()

    expect(sut.toWire(rows())).toStrictEqual({ ...NOT_EDITING, state: 'checking' })
    expect(sut.finishCheck(check, { problem: 'The query joins tables.' })).toBe(true)
    expect(sut.toWire(rows())).toStrictEqual({
      ...NOT_EDITING,
      state: 'readOnly',
      problem: 'The query joins tables.',
    })
    expect(setNote(sut, rows())).toBe(false)
  })

  it('should drop a check the rows changed since, and one that already ended', () => {
    const sut = new TabEditor()
    const old = sut.startCheck()
    const current = sut.startCheck()

    expect(sut.finishCheck(old, { table: POSTGRES_ORDERS })).toBe(false)
    expect(sut.finishCheck(current, { problem: 'No.' })).toBe(true)
    expect(sut.finishCheck(current, { table: POSTGRES_ORDERS })).toBe(false)
    sut.reset()
    expect(sut.finishCheck(sut.startCheck() - 1, { table: POSTGRES_ORDERS })).toBe(false)
    expect(sut.toWire(rows()).state).toBe('checking')
  })

  it('should never take the outcome of a check for the rows read before', () => {
    const sut = new TabEditor()
    const old = sut.startCheck()
    sut.reset()
    const current = sut.startCheck()

    expect(sut.finishCheck(old, { table: POSTGRES_ORDERS })).toBe(false)
    expect(sut.finishCheck(current, { table: POSTGRES_ORDERS })).toBe(true)
  })

  it('should forget the reason of an old check when a new one starts', () => {
    const sut = new TabEditor()
    sut.finishCheck(sut.startCheck(), { problem: 'No.' })

    sut.startCheck()

    expect(sut.toWire(rows()).problem).toBe('')
  })

  it('should describe the table, its key and how its columns take values', () => {
    const { sut, source } = editable()

    expect(sut.toWire(source)).toStrictEqual({
      ...NOT_EDITING,
      state: 'editable',
      table: 'sales.orders',
      key: ['id'],
      columns: POSTGRES_ORDERS.columns.map(({ value }) => value),
    })
  })

  it('should keep changes and say what kept one out', () => {
    const { sut, source } = editable()

    expect(setNote(sut, source)).toBe(true)
    expect(sut.hasChanges).toBe(true)
    expect(sut.toWire(source).rows).toStrictEqual([
      {
        row: 1,
        isDeleted: false,
        cells: [{ column: 2, value: { kind: 'text', text: 'x' } }],
        problem: '',
      },
    ])
    setCellOf(sut, source, [1, 0, 'abc'])
    expect(sut.toWire(source)).toMatchObject({
      notice: 'id: Type a whole number from -2147483648 to 2147483647.',
      isNoticeError: true,
    })
    setNote(sut, source, 'y')
    expect(sut.toWire(source)).toMatchObject({ notice: '', isNoticeError: false })
  })

  it('should refuse a selection of too many rows', () => {
    const { sut, source } = editable()

    sut.act(
      {
        kind: EditKind.Delete,
        block: { firstRow: 0, lastRow: 1000, columns: [0] },
        input: '',
      },
      source,
    )

    expect(sut.toWire(source)).toMatchObject({
      notice: 'Select at most 1,000 rows to change at a time.',
      isNoticeError: true,
    })
  })

  it('should preview the statements of the changes, and drop the preview at the next edit', () => {
    const { sut, source } = editable()
    setNote(sut, source)

    expect(sut.preview(source, { ...SETTING, isInOpenTransaction: true })).toBe(true)
    expect(sut.toWire(source).preview).toStrictEqual({
      id: 1,
      summary: '1 update on sales.orders',
      statements: [
        {
          sql: 'UPDATE "sales"."orders" SET "note" = $1 WHERE "id" = $2 AND "note" = $3',
          values: ["'x'", "'2'", "'gift'"],
          expectedRows: 1,
          label: 'id = 2',
        },
      ],
      deletions: 0,
      isInOpenTransaction: true,
    })
    setNote(sut, source, 'y')
    expect(sut.toWire(source).preview).toBeNull()
    sut.preview(source, SETTING)
    expect(sut.toWire(source).preview?.id).toBe(2)
    sut.closePreview()
    expect(sut.toWire(source).preview).toBeNull()
  })

  it('should say why there is nothing to preview', () => {
    const { sut, source } = editable()
    setNote(sut, source)
    sut.preview(source, SETTING)
    sut.act({ kind: EditKind.RevertAll, block: null, input: '' }, source)

    expect(sut.preview(source, SETTING)).toBe(true)
    expect(sut.toWire(source)).toMatchObject({
      preview: null,
      notice: 'There are no changes to apply.',
      isNoticeError: true,
    })
  })

  it('should clear what the last edit said once the preview is there', () => {
    const { sut, source } = editable()
    setNote(sut, source)
    setCellOf(sut, source, [1, 0, 'abc'])

    sut.preview(source, SETTING)

    expect(sut.toWire(source)).toMatchObject({ notice: '', isNoticeError: false })
  })

  it('should hand the plan of the preview over once, then wait for its outcome', () => {
    const { sut, source } = editable()
    setNote(sut, source)
    sut.preview(source, SETTING)

    expect(sut.take(2)).toBeUndefined()
    expect(sut.take(1)?.summary).toBe('1 update on sales.orders')
    expect(sut.take(1)).toBeUndefined()
    expect(sut.toWire(source)).toMatchObject({
      state: 'applying',
      preview: null,
      table: 'sales.orders',
    })
    expect(setNote(sut, source, 'z')).toBe(false)
  })

  it('should not hand a plan over while it is not editable', () => {
    const { sut, source } = editable()
    setNote(sut, source)
    sut.preview(source, SETTING)
    sut.reset()

    expect(sut.take(1)).toBeUndefined()
  })

  it('should start afresh once everything applied', () => {
    const { sut, source } = editable()
    setNote(sut, source)
    sut.preview(source, SETTING)
    sut.take(1)

    sut.finish({ isApplied: true, message: 'Applied 1 update.', problems: [] })

    expect(sut.toWire(source)).toMatchObject({
      state: 'editable',
      rows: [],
      notice: 'Applied 1 update.',
      isNoticeError: false,
    })
    expect(sut.hasChanges).toBe(false)
  })

  it('should keep the changes and mark the rows an apply could not take', () => {
    const { sut, source } = editable()
    setNote(sut, source)
    sut.act({ kind: EditKind.Insert, block: null, input: '' }, source)
    setCellOf(sut, source, [2, 0, '3'])
    setCellOf(sut, source, [2, 1, 'A-3'])
    sut.preview(source, SETTING)
    sut.take(1)

    sut.finish({
      isApplied: false,
      message: 'Nothing was applied.',
      problems: [
        { row: { isNew: false, index: 1 }, problem: 'It changed.' },
        { row: { isNew: true, id: 1 }, problem: 'Duplicate key.' },
      ],
    })

    expect(sut.toWire(source)).toMatchObject({
      rows: [{ row: 1, problem: 'It changed.' }],
      newRows: [{ id: 1, problem: 'Duplicate key.' }],
      notice: 'Nothing was applied.',
      isNoticeError: true,
    })
  })

  it('should ignore an outcome it is not waiting for', () => {
    const { sut, source } = editable()
    setNote(sut, source)

    sut.finish({ isApplied: true, message: 'Applied.', problems: [] })

    expect(sut.hasChanges).toBe(true)
    expect(sut.toWire(source).notice).toBe('')
  })

  it('should drop the changes of rows that are read again, never reusing new row ids', () => {
    const { sut, source } = editable()
    sut.act({ kind: EditKind.Insert, block: null, input: '' }, source)
    sut.notify('Applied.', true)

    sut.reset()
    sut.finishCheck(sut.startCheck(), { table: POSTGRES_ORDERS })
    expect(sut.toWire(source)).toMatchObject({ notice: '', isNoticeError: false, newRows: [] })
    sut.act({ kind: EditKind.Insert, block: null, input: '' }, source)

    expect(sut.toWire(source)).toMatchObject({ newRows: [{ id: 2 }], notice: '' })
  })

  it('should count the changed rows the filters of the view hide', () => {
    const { sut, source } = editable()
    setNote(sut, source)

    source.applyView({ sort: [], filters: [{ column: 1, operator: 'contains', values: ['A-1'] }] })

    expect(sut.toWire(source)).toMatchObject({ rows: [], hiddenRows: 1 })
  })
})
