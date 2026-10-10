import { PendingKind, type PendingValue } from '../edits/pending.ts'
import { type ValueSpec, ValueType } from '../engine/table.ts'
import {
  type JsonRecord,
  readBoolean,
  readCount,
  readNested,
  readNullable,
  readOneOf,
  readString,
} from '../json/record.ts'
import { readList, readStrings } from './parse-common.ts'
import {
  EditingState,
  type EditPreview,
  type NewRowView,
  type PendingCell,
  type PendingRow,
  type PreviewStatement,
  type TabEditing,
} from './protocol.ts'

type SpecReader = (spec: JsonRecord) => ValueSpec

const EDITING_STATES: ReadonlySet<string> = new Set(Object.values(EditingState))
const VALUE_TYPES: ReadonlySet<string> = new Set(Object.values(ValueType))
const PENDING_KINDS: ReadonlySet<string> = new Set(Object.values(PendingKind))
const WHOLE_NUMBER = /^-?\d+$/

const SPEC_READERS: Readonly<Record<ValueType, SpecReader>> = {
  [ValueType.Integer]: (spec) => ({
    type: ValueType.Integer,
    min: readWholeNumber(spec, 'min'),
    max: readWholeNumber(spec, 'max'),
  }),
  [ValueType.Decimal]: (spec) => ({
    type: ValueType.Decimal,
    precision: readCount(spec, 'precision'),
    scale: readCount(spec, 'scale'),
  }),
  [ValueType.Float]: () => ({ type: ValueType.Float }),
  [ValueType.Boolean]: () => ({ type: ValueType.Boolean }),
  [ValueType.Text]: (spec) => ({ type: ValueType.Text, maxLength: readCount(spec, 'maxLength') }),
  [ValueType.Date]: (spec) => ({ type: ValueType.Date, ...readYears(spec) }),
  [ValueType.Time]: (spec) => ({
    type: ValueType.Time,
    fraction: readCount(spec, 'fraction'),
    maxHour: readCount(spec, 'maxHour'),
    hasTimeZone: readBoolean(spec, 'hasTimeZone'),
  }),
  [ValueType.Timestamp]: (spec) => ({
    type: ValueType.Timestamp,
    fraction: readCount(spec, 'fraction'),
    hasTimeZone: readBoolean(spec, 'hasTimeZone'),
    ...readYears(spec),
  }),
  [ValueType.Year]: () => ({ type: ValueType.Year }),
  [ValueType.Json]: () => ({ type: ValueType.Json }),
  [ValueType.Choice]: (spec) => ({
    type: ValueType.Choice,
    options: readStrings(spec, 'options'),
    isMultiple: readBoolean(spec, 'isMultiple'),
  }),
  [ValueType.Uuid]: () => ({ type: ValueType.Uuid }),
  [ValueType.Server]: () => ({ type: ValueType.Server }),
  [ValueType.ReadOnly]: (spec) => ({
    type: ValueType.ReadOnly,
    reason: readString(spec, 'reason'),
  }),
}

function isEditingState(value: unknown): value is EditingState {
  return typeof value === 'string' && EDITING_STATES.has(value)
}

function isValueType(value: unknown): value is ValueType {
  return typeof value === 'string' && VALUE_TYPES.has(value)
}

function isPendingKind(value: unknown): value is PendingKind {
  return typeof value === 'string' && PENDING_KINDS.has(value)
}

// The editing of a tab, as the extension host sends it.
export function readEditing(editing: JsonRecord): TabEditing {
  return {
    state: readOneOf(editing, 'state', isEditingState),
    problem: readString(editing, 'problem'),
    table: readString(editing, 'table'),
    key: readStrings(editing, 'key'),
    columns: readList(editing, 'columns', readValueSpec),
    insertProblem: readString(editing, 'insertProblem'),
    rows: readList(editing, 'rows', readPendingRow),
    newRows: readList(editing, 'newRows', readNewRow),
    hiddenRows: readCount(editing, 'hiddenRows'),
    preview: readNullable(editing, 'preview', (record, key) =>
      readPreview(readNested(record, key)),
    ),
    notice: readString(editing, 'notice'),
    isNoticeError: readBoolean(editing, 'isNoticeError'),
  }
}

export function readValueSpec(spec: JsonRecord): ValueSpec {
  return SPEC_READERS[readOneOf(spec, 'type', isValueType)](spec)
}

// The limits of an integer column are exact decimal text: the grid compares them as big integers.
function readWholeNumber(record: JsonRecord, key: string): string {
  const text = readString(record, key)
  if (!WHOLE_NUMBER.test(text)) {
    throw new TypeError(`"${key}" must be a whole number`)
  }
  return text
}

function readYears(spec: JsonRecord): { readonly minYear: number; readonly maxYear: number } {
  return { minYear: readCount(spec, 'minYear'), maxYear: readCount(spec, 'maxYear') }
}

function readPendingRow(row: JsonRecord): PendingRow {
  return {
    row: readCount(row, 'row'),
    isDeleted: readBoolean(row, 'isDeleted'),
    cells: readList(row, 'cells', readPendingCell),
    problem: readString(row, 'problem'),
  }
}

function readNewRow(row: JsonRecord): NewRowView {
  return {
    id: readCount(row, 'id'),
    cells: readList(row, 'cells', readPendingCell),
    problem: readString(row, 'problem'),
  }
}

function readPendingCell(cell: JsonRecord): PendingCell {
  return { column: readCount(cell, 'column'), value: readPendingValue(readNested(cell, 'value')) }
}

function readPendingValue(value: JsonRecord): PendingValue {
  const kind = readOneOf(value, 'kind', isPendingKind)
  return kind === PendingKind.Text ? { kind, text: readString(value, 'text') } : { kind }
}

function readPreview(preview: JsonRecord): EditPreview {
  return {
    id: readCount(preview, 'id'),
    summary: readString(preview, 'summary'),
    statements: readList(preview, 'statements', readPreviewStatement),
    deletions: readCount(preview, 'deletions'),
    isInOpenTransaction: readBoolean(preview, 'isInOpenTransaction'),
  }
}

function readPreviewStatement(statement: JsonRecord): PreviewStatement {
  return {
    sql: readString(statement, 'sql'),
    values: readStrings(statement, 'values'),
    expectedRows: readCount(statement, 'expectedRows'),
    label: readString(statement, 'label'),
  }
}
