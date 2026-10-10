// Reads values that come from storage or messages, where nothing guarantees their shape: each reader
// throws a TypeError naming the field when the value is not what the code expects.
export type JsonRecord = ReadonlyMap<string, unknown>

interface Kind<T> {
  readonly description: string
  readonly matches: (value: unknown) => value is T
}

const STRING: Kind<string> = {
  description: 'a string',
  matches: (value): value is string => typeof value === 'string',
}

const NUMBER: Kind<number> = {
  description: 'a number',
  matches: (value): value is number => Number.isFinite(value),
}

const BOOLEAN: Kind<boolean> = {
  description: 'a boolean',
  matches: (value): value is boolean => typeof value === 'boolean',
}

const COUNT: Kind<number> = {
  description: 'a whole number of 0 or more',
  matches: (value): value is number => Number.isSafeInteger(value) && (value as number) >= 0,
}

const DIGITS = /^\d+$/

// Exact whatever its size: a BIGINT the driver keeps as the server's text.
const BIG_COUNT: Kind<string> = {
  description: 'a whole number of 0 or more, as text',
  matches: (value): value is string => typeof value === 'string' && DIGITS.test(value),
}

const LIST: Kind<readonly unknown[]> = {
  description: 'a list',
  matches: (value): value is readonly unknown[] => Array.isArray(value),
}

export function readRecord(value: unknown): JsonRecord {
  if (!isObject(value)) {
    throw new TypeError('expected an object')
  }
  return new Map(Object.entries(value))
}

export function readString(record: JsonRecord, key: string): string {
  return readField(record, key, STRING)
}

export function readNumber(record: JsonRecord, key: string): number {
  return readField(record, key, NUMBER)
}

export function readCount(record: JsonRecord, key: string): number {
  return readField(record, key, COUNT)
}

export function readBigCount(record: JsonRecord, key: string): bigint {
  return BigInt(readField(record, key, BIG_COUNT))
}

// A field that holds null when it has no value; anything else must pass `read`.
export function readNullable<T>(
  record: JsonRecord,
  key: string,
  read: (record: JsonRecord, key: string) => T,
): T | null {
  return record.get(key) === null ? null : read(record, key)
}

// SQL NULL becomes undefined.
export function readNullableString(record: JsonRecord, key: string): string | undefined {
  const value = record.get(key)
  return value === null || value === undefined ? undefined : readString(record, key)
}

export function readBoolean(record: JsonRecord, key: string): boolean {
  return readField(record, key, BOOLEAN)
}

export function readArray(record: JsonRecord, key: string): readonly unknown[] {
  return readField(record, key, LIST)
}

// A list of records, each read by `read`.
export function readList<T>(record: JsonRecord, key: string, read: (item: JsonRecord) => T): T[] {
  return readArray(record, key).map((item) => read(readRecord(item)))
}

// A list of strings: a TypeError names the position of the first item that is not one.
export function readStrings(record: JsonRecord, key: string): string[] {
  return readArray(record, key).map((value, index) =>
    readString(new Map([[String(index), value]]), String(index)),
  )
}

export function readNested(record: JsonRecord, key: string): JsonRecord {
  return readRecord(readField(record, key, { description: 'an object', matches: isObject }))
}

export function readOneOf<T extends string>(
  record: JsonRecord,
  key: string,
  isAllowed: (value: unknown) => value is T,
): T {
  return readField(record, key, { description: 'a known value', matches: isAllowed })
}

function readField<T>(record: JsonRecord, key: string, kind: Kind<T>): T {
  const value = record.get(key)
  if (!kind.matches(value)) {
    throw new TypeError(`"${key}" must be ${kind.description}`)
  }
  return value
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
