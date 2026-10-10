import { describe, expect, it, vi } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { ColumnKind, type ResultColumn, type Row } from '../engine/query.ts'
import {
  ExportFormat,
  formatRows,
  type FormatTarget,
  isExportFormat,
  rowFormatter,
} from './export-format.ts'

const COLUMNS: readonly ResultColumn[] = [
  { name: 'id', dataType: 'INT8', kind: ColumnKind.Number },
  { name: 'note', dataType: 'TEXT', kind: ColumnKind.Text },
  { name: 'data', dataType: 'JSONB', kind: ColumnKind.Json },
]
const ROWS: readonly Row[] = [
  ['9007199254740993', 'say "hi", ok', '{"a": 12345678901234567890}'],
  [null, '', null],
  [1.5, 'line\nbreak', 'not json'],
]
const TARGET: FormatTarget = {
  columns: COLUMNS,
  table: ['sales', 'orders'],
  dialect: POSTGRES_DIALECT,
}

function format(kind: ExportFormat, rows: readonly Row[] = ROWS, target = TARGET): string {
  return formatRows(rows, rowFormatter(kind, target))
}

describe('isExportFormat', () => {
  it('should accept the known formats only', () => {
    expect(Object.values(ExportFormat).every(isExportFormat)).toBe(true)
    expect(isExportFormat('xlsx')).toBe(false)
    expect(isExportFormat(undefined)).toBe(false)
  })
})

describe('CSV', () => {
  it('should write a header and quote only the fields that need it, keeping NULL apart from empty', () => {
    expect(format(ExportFormat.Csv)).toBe(
      [
        'id,note,data',
        '9007199254740993,"say ""hi"", ok","{""a"": 12345678901234567890}"',
        ',"",',
        '1.5,"line\nbreak",not json',
        '',
      ].join('\r\n'),
    )
  })

  it('should quote fields with a carriage return', () => {
    expect(format(ExportFormat.Csv, [['a\rb', true, 0]])).toContain('"a\rb",true,0')
  })
})

describe('TSV', () => {
  it('should write the values only, quoting tabs, quotes and line breaks', () => {
    expect(
      format(ExportFormat.Tsv, [
        ['a\tb', 'say "x"', null],
        [1, 'r\rn', 'plain'],
      ]),
    ).toBe('"a\tb"\t"say ""x"""\t\r\n1\t"r\rn"\tplain\r\n')
  })
})

describe('JSON', () => {
  it('should write an array of objects keeping exact numbers and JSON values as they are', () => {
    expect(JSON.parse(format(ExportFormat.Json, [ROWS[0] ?? []]))).toBeDefined()
    expect(format(ExportFormat.Json)).toBe(
      [
        '[',
        '  {"id": 9007199254740993, "note": "say \\"hi\\", ok", "data": {"a": 12345678901234567890}},',
        '  {"id": null, "note": "", "data": null},',
        '  {"id": 1.5, "note": "line\\nbreak", "data": "not json"}',
        ']',
        '',
      ].join('\n'),
    )
  })

  it('should write an empty array without rows', () => {
    expect(JSON.parse(format(ExportFormat.Json, []))).toStrictEqual([])
  })

  it('should quote numbers that JSON cannot write', () => {
    const columns: readonly ResultColumn[] = [
      { name: 'a', dataType: 'NUMERIC', kind: ColumnKind.Number },
      { name: 'b', dataType: 'FLOAT8', kind: ColumnKind.Number },
      { name: 'c', dataType: 'NUMERIC', kind: ColumnKind.Number },
      { name: 'd', dataType: 'TEXT', kind: ColumnKind.Text },
    ]

    expect(
      format(ExportFormat.Json, [['NaN', Number.POSITIVE_INFINITY, '007', '{}']], {
        ...TARGET,
        columns,
      }),
    ).toBe('[\n  {"a": "NaN", "b": "Infinity", "c": "007", "d": "{}"}\n]\n')
  })

  it('should give columns with the same name distinct keys', () => {
    const columns: readonly ResultColumn[] = [
      { name: 'id', dataType: 'INT4', kind: ColumnKind.Number },
      { name: 'id', dataType: 'INT4', kind: ColumnKind.Number },
      { name: 'id (2)', dataType: 'INT4', kind: ColumnKind.Number },
      { name: 'id', dataType: 'INT4', kind: ColumnKind.Number },
    ]

    expect(format(ExportFormat.Json, [[1, 2, 3, 4]], { ...TARGET, columns })).toBe(
      '[\n  {"id": 1, "id (2)": 2, "id (2) (2)": 3, "id (3)": 4}\n]\n',
    )
  })

  it('should rethrow what is not a JSON syntax error', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new RangeError('too deep')
    })
    const columns: readonly ResultColumn[] = [
      { name: 'j', dataType: 'JSON', kind: ColumnKind.Json },
    ]

    expect(() => format(ExportFormat.Json, [['[]']], { ...TARGET, columns })).toThrow(RangeError)
  })
})

describe('SQL', () => {
  it('should write one INSERT per row with quoted names and the literals of the dialect', () => {
    expect(format(ExportFormat.Sql, ROWS.slice(0, 2))).toBe(
      [
        `INSERT INTO "sales"."orders" ("id", "note", "data") VALUES (9007199254740993, 'say "hi", ok', '{"a": 12345678901234567890}');`,
        `INSERT INTO "sales"."orders" ("id", "note", "data") VALUES (NULL, '', NULL);`,
        '',
      ].join('\n'),
    )
  })

  it('should quote names and values the MySQL way', () => {
    const target = { columns: COLUMNS.slice(0, 2), table: ['t'], dialect: MYSQL_DIALECT }

    expect(format(ExportFormat.Sql, [['1', 'a\\b']], target)).toBe(
      "INSERT INTO `t` (`id`, `note`) VALUES (1, 'a\\\\b');\n",
    )
  })
})
