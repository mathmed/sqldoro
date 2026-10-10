import { nameKey, uniqueName } from '../connection/names.ts'
import { readRecord, readString } from '../json/record.ts'
import { decodeList, encodeList, type ListFormat } from '../json/versioned-list.ts'

// A named query kept for later, in a folder ("" is the top; "reports/monthly" nests).
export interface SavedQuery {
  readonly id: string
  readonly name: string
  readonly folder: string
  readonly sql: string
  // ISO 8601, in UTC.
  readonly createdAt: string
  readonly updatedAt: string
}

export interface FolderContents {
  readonly folders: readonly string[]
  readonly queries: readonly SavedQuery[]
}

export interface ImportResult {
  readonly queries: readonly SavedQuery[]
  readonly added: number
  readonly problems: readonly string[]
}

const FOLDER_SEPARATOR = '/'
// Marks a file as saved queries exported by sqldoro.
const FILE_KIND = 'sqldoro.savedQueries'
const FILE_INDENT = 2

export const SAVED_QUERY_FORMAT: ListFormat<SavedQuery> = {
  version: 1,
  key: 'queries',
  listName: 'saved queries',
  entryName: 'Saved query',
  decode: (value) => {
    const record = readRecord(value)
    return {
      id: readString(record, 'id'),
      name: readString(record, 'name'),
      folder: normalizeFolder(readString(record, 'folder')),
      sql: readString(record, 'sql'),
      createdAt: readString(record, 'createdAt'),
      updatedAt: readString(record, 'updatedAt'),
    }
  },
}

// " reports / monthly/ " is "reports/monthly".
export function normalizeFolder(folder: string): string {
  return folder
    .split(FOLDER_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(FOLDER_SEPARATOR)
}

export function queryNameProblem(name: string): string | undefined {
  return name.trim() === '' ? 'A saved query needs a name' : undefined
}

// Adds the query, or replaces the one with its id.
export function putQuery(queries: readonly SavedQuery[], query: SavedQuery): readonly SavedQuery[] {
  const others = queries.filter((saved) => saved.id !== query.id)
  return others.length === queries.length
    ? [...queries, query]
    : queries.map((saved) => (saved.id === query.id ? query : saved))
}

export function deleteQuery(queries: readonly SavedQuery[], id: string): readonly SavedQuery[] {
  return queries.filter((saved) => saved.id !== id)
}

// Every folder that holds a query, with the folders above it, in order.
export function folderPaths(queries: readonly SavedQuery[]): string[] {
  const paths = new Set<string>()
  for (const { folder } of queries) {
    const parts = folder === '' ? [] : folder.split(FOLDER_SEPARATOR)
    parts.forEach((...[, index]) => paths.add(parts.slice(0, index + 1).join(FOLDER_SEPARATOR)))
  }
  return [...paths].toSorted((left, right) => left.localeCompare(right, 'en'))
}

// The last part of a folder path: the name the folder shows under its parent.
export function folderName(folder: string): string {
  return folder.slice(folder.lastIndexOf(FOLDER_SEPARATOR) + 1)
}

// The folders right under `folder` and the queries in it, each in name order.
export function folderContents(queries: readonly SavedQuery[], folder: string): FolderContents {
  const prefix = folder === '' ? '' : `${folder}${FOLDER_SEPARATOR}`
  const folders = folderPaths(queries).filter(
    (path) => path.startsWith(prefix) && !path.slice(prefix.length).includes(FOLDER_SEPARATOR),
  )
  return {
    folders: folders.filter((path) => path !== folder),
    queries: queries
      .filter((saved) => saved.folder === folder)
      .toSorted((left, right) => left.name.localeCompare(right.name, 'en')),
  }
}

// A name not taken in the folder yet: "Report", then "Report (2)".
export function freeName(queries: readonly SavedQuery[], folder: string, name: string): string {
  const taken = new Set(
    queries.filter((saved) => saved.folder === folder).map((saved) => nameKey(saved.name)),
  )
  return uniqueName(name, taken)
}

export function exportQueries(queries: readonly SavedQuery[]): string {
  const file = { kind: FILE_KIND, ...encodeList(queries, [], SAVED_QUERY_FORMAT) }
  return `${JSON.stringify(file, null, FILE_INDENT)}\n`
}

type Parsed = { readonly value: unknown } | { readonly problem: string }

// The queries of an exported file join the saved ones with new ids; a name already taken in its
// folder gets a number.
export function importQueries(
  text: string,
  existing: readonly SavedQuery[],
  createId: () => string,
): ImportResult {
  const parsed = parseJson(text)
  if ('problem' in parsed) {
    return { queries: existing, added: 0, problems: [parsed.problem] }
  }
  if (!isQueryFile(parsed.value)) {
    return {
      queries: existing,
      added: 0,
      problems: ['The file does not hold queries saved by sqldoro'],
    }
  }
  const decoded = decodeList(parsed.value, SAVED_QUERY_FORMAT)
  const queries = decoded.items.reduce<readonly SavedQuery[]>(
    (merged, query) => [
      ...merged,
      { ...query, id: createId(), name: freeName(merged, query.folder, query.name) },
    ],
    existing,
  )
  return { queries, added: decoded.items.length, problems: decoded.problems }
}

function parseJson(text: string): Parsed {
  try {
    return { value: JSON.parse(text) as unknown }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }
    return { problem: `The file is not JSON: ${error.message}` }
  }
}

function isQueryFile(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === FILE_KIND
}
