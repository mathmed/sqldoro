import { describe, expect, it } from 'vitest'

import { editableTab, resultTab } from '../../../test/fixtures/results.ts'
import { EditKind } from '../edits/edit-kind.ts'
import { PendingKind } from '../edits/pending.ts'
import { ColumnKind } from '../engine/query.ts'
import { FilterOperator } from '../results/conditions.ts'
import { type WebviewMessage, WebviewMessageType } from '../results/protocol.ts'
import {
  displayColumn,
  projectRow,
  projectTab,
  projectView,
  resultMessage,
  resultView,
} from './column-projection.ts'

const COLUMNS = [
  { name: 'id', dataType: 'INT4', kind: ColumnKind.Number },
  { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text },
  { name: 'note', dataType: 'TEXT', kind: ColumnKind.Text },
]
// The grid shows note, then id; name is hidden.
const SHOWN = [2, 0]
const NAME_FILTER = { column: 1, operator: FilterOperator.IsNull, values: [] }
const NOTE_FILTER = { column: 2, operator: FilterOperator.Contains, values: ['a'] }
const VIEW = {
  sort: [
    { column: 0, isDescending: true },
    { column: 1, isDescending: false },
  ],
  filters: [NAME_FILTER, NOTE_FILTER],
}

describe('projectTab', () => {
  it('should show the columns, what the catalog says of them and the view, in the grid order', () => {
    const tab = resultTab({
      columns: COLUMNS,
      meta: [
        { choices: [], reference: 'a (id)' },
        { choices: ['x'], reference: '' },
        { choices: [], reference: '' },
      ],
      view: VIEW,
    })

    expect(projectTab(tab, SHOWN)).toMatchObject({
      columns: [COLUMNS[2], COLUMNS[0]],
      meta: [
        { choices: [], reference: '' },
        { choices: [], reference: 'a (id)' },
      ],
      view: {
        sort: [{ column: 1, isDescending: true }],
        filters: [{ ...NOTE_FILTER, column: 0 }],
      },
    })
  })

  it('should show the changes of the rows in the columns shown', () => {
    const text = { kind: PendingKind.Text, text: 'x' } as const
    const tab = editableTab({
      columns: [
        { type: 'integer', min: '0', max: '9' },
        { type: 'server' },
        { type: 'text', maxLength: 0 },
      ],
      rows: [
        {
          row: 0,
          isDeleted: false,
          problem: '',
          cells: [
            { column: 1, value: text },
            { column: 2, value: text },
          ],
        },
      ],
      newRows: [{ id: 1, problem: '', cells: [{ column: 0, value: text }] }],
    })

    expect(projectTab(tab, SHOWN).editing).toMatchObject({
      columns: [{ type: 'text' }, { type: 'integer' }],
      rows: [{ row: 0, cells: [{ column: 0, value: text }] }],
      newRows: [{ id: 1, cells: [{ column: 1, value: text }] }],
    })
  })
})

describe('views', () => {
  it('should project a view onto the columns shown', () => {
    expect(projectView(VIEW, SHOWN)).toStrictEqual({
      sort: [{ column: 1, isDescending: true }],
      filters: [{ ...NOTE_FILTER, column: 0 }],
    })
  })

  it('should put a view of the grid back, keeping the sort and filters of the hidden columns', () => {
    const changed = {
      sort: [{ column: 0, isDescending: false }],
      filters: [{ column: 1, operator: FilterOperator.Equals, values: ['5'] }],
    }

    expect(resultView(changed, SHOWN, VIEW)).toStrictEqual({
      sort: [
        { column: 2, isDescending: false },
        { column: 1, isDescending: false },
      ],
      filters: [{ column: 0, operator: FilterOperator.Equals, values: ['5'] }, NAME_FILTER],
    })
  })
})

describe('projectRow and displayColumn', () => {
  it('should show the cells of the columns shown, and which were cut', () => {
    expect(projectRow({ cells: [1, 'long', 'note…'], truncated: [1, 2] }, SHOWN)).toStrictEqual({
      cells: ['note…', 1],
      truncated: [0],
    })
    expect(projectRow({ cells: [1], truncated: [] }, SHOWN)).toStrictEqual({
      cells: [null, 1],
      truncated: [],
    })
  })

  it('should find where a column of the result shows, if it does', () => {
    expect(displayColumn(SHOWN, 0)).toBe(1)
    expect(displayColumn(SHOWN, 1)).toBeUndefined()
  })
})

describe('resultMessage', () => {
  function back(message: WebviewMessage): WebviewMessage {
    return resultMessage(message, SHOWN, VIEW)
  }

  it('should name the columns of the result in what names a column', () => {
    expect(back({ type: WebviewMessageType.CopyColumnName, tabId: 't', column: 0 })).toStrictEqual({
      type: WebviewMessageType.CopyColumnName,
      tabId: 't',
      column: 2,
    })
    expect(back({ type: WebviewMessageType.FetchDistinct, tabId: 't', column: 5 })).toStrictEqual({
      type: WebviewMessageType.FetchDistinct,
      tabId: 't',
      column: 5,
    })
    expect(back({ type: WebviewMessageType.Ready })).toStrictEqual({
      type: WebviewMessageType.Ready,
    })
  })

  it('should name the columns of the result in the blocks of copies and edits', () => {
    const block = { firstRow: 1, lastRow: 2, columns: [0, 1] }
    const copy = back({
      type: WebviewMessageType.Copy,
      tabId: 't',
      viewVersion: 0,
      block,
      format: 'csv',
    })
    const edit = back({
      type: WebviewMessageType.Edit,
      tabId: 't',
      viewVersion: 0,
      edit: { kind: EditKind.SetNull, block, input: '' },
    })
    const insert = back({
      type: WebviewMessageType.Edit,
      tabId: 't',
      viewVersion: 0,
      edit: { kind: EditKind.Insert, block: null, input: '' },
    })

    expect(copy).toMatchObject({ block: { firstRow: 1, lastRow: 2, columns: [2, 0] } })
    expect(edit).toMatchObject({ edit: { block: { columns: [2, 0] } } })
    expect(insert).toMatchObject({ edit: { block: null } })
  })

  it('should put a view back in the columns of the result', () => {
    expect(
      back({
        type: WebviewMessageType.SetView,
        tabId: 't',
        view: { sort: [], filters: [] },
        isServerSide: true,
      }),
    ).toMatchObject({
      view: { sort: [{ column: 1, isDescending: false }], filters: [NAME_FILTER] },
    })
  })
})
