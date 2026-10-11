import { describe, expect, it } from 'vitest'

import { resultTab } from '../../../test/fixtures/results.ts'
import { NOT_EDITING } from '../edits/tab-editor.ts'
import type { ValueSpec } from '../engine/table.ts'
import { readValueSpec } from './parse-editing.ts'
import { parseHostMessage } from './parse-host-message.ts'
import { parseWebviewMessage } from './parse-webview-message.ts'
import type { TabEditing } from './tab-editing.ts'

const RANGE = { firstRow: 0, lastRow: 2, columns: [1, 0] }

const EDITING: TabEditing = {
  state: 'editable',
  problem: '',
  table: 'sales.orders',
  key: ['id'],
  columns: [{ type: 'integer', min: '-9223372036854775808', max: '9223372036854775807' }],
  insertProblem: 'Adding rows needs a value for code.',
  rows: [
    {
      row: 4,
      isDeleted: true,
      cells: [
        { column: 0, value: { kind: 'text', text: '7' } },
        { column: 1, value: { kind: 'null' } },
        { column: 2, value: { kind: 'default' } },
      ],
      problem: 'It changed.',
    },
  ],
  newRows: [{ id: 2, cells: [], problem: '' }],
  hiddenRows: 3,
  preview: {
    id: 1,
    summary: '1 update on sales.orders',
    statements: [{ sql: 'UPDATE t SET a = $1', values: ["'x'"], expectedRows: 1, label: 'id = 7' }],
    deletions: 0,
    isInOpenTransaction: false,
  },
  notice: 'Applied.',
  isNoticeError: true,
}

function editingOf(editing: object): unknown {
  return parseHostMessage({ type: 'tab', tab: { ...resultTab(), editing } })
}

describe('the editing of a tab, as the host sends it', () => {
  it('should read every part', () => {
    expect(editingOf(EDITING)).toStrictEqual({
      type: 'tab',
      tab: { ...resultTab(), editing: EDITING },
    })
    expect(editingOf(NOT_EDITING)).toStrictEqual({ type: 'tab', tab: resultTab() })
  })

  it.each<ValueSpec>([
    { type: 'integer', min: '0', max: '255' },
    { type: 'decimal', precision: 10, scale: 2 },
    { type: 'float' },
    { type: 'boolean' },
    { type: 'text', maxLength: 20 },
    { type: 'date', minYear: 1000, maxYear: 9999 },
    { type: 'time', fraction: 6, maxHour: 23, hasTimeZone: true },
    { type: 'timestamp', fraction: 3, hasTimeZone: false, minYear: 1970, maxYear: 2038 },
    { type: 'year' },
    { type: 'json' },
    { type: 'choice', options: ['a', 'b'], isMultiple: true },
    { type: 'uuid' },
    { type: 'server' },
    { type: 'readOnly', reason: 'Binary values are shown read-only.' },
  ])('should read how a column takes values: %j', (spec) => {
    expect(readValueSpec(new Map(Object.entries({ ...spec, extra: 1 })))).toStrictEqual(spec)
  })

  it.each([
    [{ ...EDITING, state: 'busy' }, '"state" must be a known value'],
    [{ ...EDITING, columns: [{ type: 'money' }] }, '"type" must be a known value'],
    [
      { ...EDITING, columns: [{ type: 'integer', min: '1.5', max: '2' }] },
      '"min" must be a whole number',
    ],
    [
      { ...EDITING, columns: [{ type: 'integer', min: '1', max: 'x9' }] },
      '"max" must be a whole number',
    ],
    [
      { ...EDITING, columns: [{ type: 'integer', min: '1', max: '9x' }] },
      '"max" must be a whole number',
    ],
    [
      {
        ...EDITING,
        rows: [{ ...EDITING.rows[0], cells: [{ column: 0, value: { kind: 'zero' } }] }],
      },
      '"kind" must be a known value',
    ],
    [
      {
        ...EDITING,
        rows: [{ ...EDITING.rows[0], cells: [{ column: 0, value: { kind: 'text' } }] }],
      },
      '"text" must be a string',
    ],
    [
      { ...EDITING, preview: { ...EDITING.preview, isInOpenTransaction: 'yes' } },
      '"isInOpenTransaction" must be a boolean',
    ],
  ])('should refuse an editing whose field is wrong: %#', (editing, message) => {
    expect(() => editingOf(editing)).toThrow(new TypeError(message))
  })

  it('should read no preview', () => {
    expect(editingOf({ ...EDITING, preview: null })).toMatchObject({
      tab: { editing: { preview: null } },
    })
  })
})

describe('the edits the result view asks for', () => {
  it.each([
    { kind: 'set', block: RANGE, input: '42' },
    { kind: 'setNull', block: RANGE, input: '' },
    { kind: 'insert', block: null, input: '' },
    { kind: 'revertAll', block: null, input: '' },
    { kind: 'delete', block: RANGE, input: '' },
  ])('should read an edit: %j', (edit) => {
    expect(parseWebviewMessage({ type: 'edit', tabId: 't', viewVersion: 3, edit })).toStrictEqual({
      type: 'edit',
      tabId: 't',
      viewVersion: 3,
      edit,
    })
  })

  it.each([
    [{ kind: 'drop', block: null, input: '' }, '"kind" must be a known value'],
    [
      { kind: 'set', block: { ...RANGE, firstRow: 3 }, input: '' },
      '"block" must start before it ends',
    ],
    [{ kind: 'set', block: RANGE }, '"input" must be a string'],
    [
      { kind: 'set', block: { ...RANGE, columns: [-1] }, input: '' },
      '"0" must be a whole number of 0 or more',
    ],
  ])('should refuse an edit whose field is wrong: %j', (edit, message) => {
    expect(() => parseWebviewMessage({ type: 'edit', tabId: 't', viewVersion: 3, edit })).toThrow(
      new TypeError(message),
    )
  })

  it('should read the requests to preview, close the preview and apply it', () => {
    expect(parseWebviewMessage({ type: 'previewEdits', tabId: 't' })).toStrictEqual({
      type: 'previewEdits',
      tabId: 't',
    })
    expect(parseWebviewMessage({ type: 'closePreview', tabId: 't' })).toStrictEqual({
      type: 'closePreview',
      tabId: 't',
    })
    expect(parseWebviewMessage({ type: 'applyEdits', tabId: 't', previewId: 2 })).toStrictEqual({
      type: 'applyEdits',
      tabId: 't',
      previewId: 2,
    })
    expect(() => parseWebviewMessage({ type: 'applyEdits', tabId: 't', previewId: -1 })).toThrow(
      new TypeError('"previewId" must be a whole number of 0 or more'),
    )
    expect(() => parseWebviewMessage({ type: 'previewEdits' })).toThrow(TypeError)
    expect(() => parseWebviewMessage({ type: 'closePreview' })).toThrow(TypeError)
  })
})
