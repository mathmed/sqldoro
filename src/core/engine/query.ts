export type CellValue = boolean | null | number | string

export type Row = readonly CellValue[]

// A value bound to a statement parameter: it reaches the server apart from the SQL text.
export type QueryValue = boolean | null | number | string

// What a column holds, as far as showing, sorting and writing its values goes. Exact numbers stay
// text in Number columns; binary values are hexadecimal text.
export const ColumnKind = {
  Number: 'number',
  Text: 'text',
  Boolean: 'boolean',
  Temporal: 'temporal',
  Json: 'json',
  Binary: 'binary',
  Other: 'other',
} as const

export type ColumnKind = (typeof ColumnKind)[keyof typeof ColumnKind]

const COLUMN_KINDS: ReadonlySet<string> = new Set(Object.values(ColumnKind))

export function isColumnKind(value: unknown): value is ColumnKind {
  return typeof value === 'string' && COLUMN_KINDS.has(value)
}

export interface ResultColumn {
  readonly name: string
  readonly dataType: string
  readonly kind: ColumnKind
}

export interface QueryRequest {
  readonly sql: string
  readonly values: readonly QueryValue[]
  // Rows beyond this limit are not kept: the result is then flagged as truncated.
  readonly maxRows: number
  // Receives the columns of the result once, before its first rows.
  readonly onColumns: (columns: readonly ResultColumn[]) => void
  // Receives the kept rows in batches, as they arrive from the server.
  readonly onRows: (rows: readonly Row[]) => void
}

export interface QueryResult {
  readonly columns: readonly ResultColumn[]
  readonly rows: readonly Row[]
  readonly isTruncated: boolean
  readonly affectedRows: number | undefined
}

export interface QueryExecution {
  readonly result: Promise<QueryResult>
  readonly cancel: () => Promise<void>
}

export class QueryCancelledError extends Error {
  override readonly name = 'QueryCancelledError'

  constructor() {
    super('The query was cancelled')
  }
}

const HEX_RADIX = 16
const HEX_DIGITS_PER_BYTE = 2
const PRIMITIVE_CELL_TYPES: ReadonlySet<string> = new Set(['boolean', 'number', 'string'])

// Drivers keep exact numbers and dates as the text the server sent; anything else that is not a
// primitive becomes text here so that every cell can be shown and sent to the webview as is.
export function toCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) {
    return null
  }
  return isPrimitiveCell(value) ? value : describeValue(value)
}

function isPrimitiveCell(value: unknown): value is boolean | number | string {
  return PRIMITIVE_CELL_TYPES.has(typeof value)
}

function describeValue(value: unknown): string {
  if (value instanceof Uint8Array) {
    return toHex(value)
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return JSON.stringify(value)
}

function toHex(bytes: Uint8Array): string {
  const digits = Array.from(bytes, (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0'),
  )
  return `0x${digits.join('')}`
}

// Keeps at most `maxRows` rows of a result and hands them to `onRows` in batches, after handing the
// columns that describe them to `onColumns`.
export class RowCollector {
  readonly #request: Pick<QueryRequest, 'maxRows' | 'onColumns' | 'onRows'>
  readonly #batchSize: number
  readonly #rows: Row[] = []
  #columns: readonly ResultColumn[] = []
  #isDescribed = false
  #batch: Row[] = []
  #isTruncated = false

  constructor(request: Pick<QueryRequest, 'maxRows' | 'onColumns' | 'onRows'>, batchSize: number) {
    if (!isCount(request.maxRows) || !isCount(batchSize) || batchSize === 0) {
      throw new RangeError(
        'maxRows and the batch size must be whole numbers, the batch size above 0',
      )
    }
    this.#request = request
    this.#batchSize = batchSize
  }

  // Only the first description counts: later result sets of the same statement are not kept.
  describe(columns: readonly ResultColumn[]): void {
    if (this.#isDescribed) {
      return
    }
    this.#isDescribed = true
    this.#columns = columns
    this.#request.onColumns(columns)
  }

  get remaining(): number {
    return this.#request.maxRows - this.#rows.length
  }

  add(row: Row): void {
    if (this.remaining === 0) {
      this.#isTruncated = true
      return
    }
    this.#rows.push(row)
    this.#batch.push(row)
    if (this.#batch.length === this.#batchSize) {
      this.flush()
    }
  }

  markTruncated(): void {
    this.#isTruncated = true
  }

  flush(): void {
    if (this.#batch.length === 0) {
      return
    }
    const batch = this.#batch
    this.#batch = []
    this.#request.onRows(batch)
  }

  finish(affectedRows: number | undefined): QueryResult {
    this.describe([])
    this.flush()
    return {
      columns: this.#columns,
      rows: this.#rows,
      isTruncated: this.#isTruncated,
      affectedRows,
    }
  }
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}
