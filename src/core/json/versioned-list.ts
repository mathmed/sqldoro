import { readArray, readNumber, readRecord } from './record.ts'

// A list saved with the version of its format, read back entry by entry: what this version cannot
// read is kept and written back as it was, never dropped.
export interface ListFormat<T> {
  readonly version: number
  // The field that holds the entries.
  readonly key: string
  // What people call the list and one entry: "saved connections", "Saved connection".
  readonly listName: string
  readonly entryName: string
  // Throws a TypeError naming the field it cannot read.
  readonly decode: (value: unknown) => T
}

export interface DecodedList<T> {
  readonly items: readonly T[]
  readonly unreadable: readonly unknown[]
  readonly problems: readonly string[]
  // False when the whole value is unreadable, for example written by a newer version.
  readonly isWritable: boolean
}

interface DecodedEntry<T> {
  readonly entry: unknown
  readonly item: T | undefined
  readonly problem: string | undefined
}

export function encodeList<T>(
  items: readonly T[],
  unreadable: readonly unknown[],
  format: Pick<ListFormat<T>, 'key' | 'version'>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries<unknown>([
    ['version', format.version],
    [format.key, [...items, ...unreadable]],
  ])
}

export function decodeList<T>(value: unknown, format: ListFormat<T>): DecodedList<T> {
  if (value === undefined) {
    return { items: [], unreadable: [], problems: [], isWritable: true }
  }
  try {
    const stored = readRecord(value)
    const version = readNumber(stored, 'version')
    if (version !== format.version) {
      return unwritable(format, `their format (version ${String(version)}) is not supported`)
    }
    return decodeEntries(readArray(stored, format.key), format)
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error
    }
    return unwritable(format, error.message)
  }
}

function unwritable<T>(format: ListFormat<T>, reason: string): DecodedList<T> {
  const problem = `The ${format.listName} cannot be read: ${reason}`
  return { items: [], unreadable: [], problems: [problem], isWritable: false }
}

function decodeEntries<T>(entries: readonly unknown[], format: ListFormat<T>): DecodedList<T> {
  const decoded = entries.map((entry, index) => decodeEntry(entry, index, format))
  return {
    items: decoded.flatMap(({ item }) => (item === undefined ? [] : [item])),
    unreadable: decoded.flatMap(({ entry, item }) => (item === undefined ? [entry] : [])),
    problems: decoded.flatMap(({ problem }) => (problem === undefined ? [] : [problem])),
    isWritable: true,
  }
}

function decodeEntry<T>(entry: unknown, index: number, format: ListFormat<T>): DecodedEntry<T> {
  try {
    return { entry, item: format.decode(entry), problem: undefined }
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error
    }
    const problem = `${format.entryName} #${String(index + 1)} cannot be read: ${error.message}`
    return { entry, item: undefined, problem }
  }
}
