import {
  childFolders,
  FOLDER_SEPARATOR,
  folderName,
  folderPathsOf,
  isWithin,
  normalizeFolder,
  parentFolder,
} from '../text/folder-paths.ts'
import type { ConnectionConfig } from './connection.ts'

// Folders group connections in the Connections view: "clients/acme" is the folder acme inside the
// folder clients. A folder exists while a connection is in it (or in a folder inside it).
const MAX_FOLDER_LENGTH = 200
const FIRST_PRINTABLE_CODE = 0x20
const DELETE_CODE = 0x7f

// A folder of the view: its whole path, its name, the folders right inside it and its connections.
export interface FolderNode {
  readonly path: string
  readonly name: string
  readonly folders: readonly string[]
  readonly connections: readonly ConnectionConfig[]
}

// Why a folder cannot be kept, for people; undefined when it can.
export function folderProblem(folder: string): string | undefined {
  if (folder.length > MAX_FOLDER_LENGTH) {
    return `The folder must have at most ${String(MAX_FOLDER_LENGTH)} characters`
  }
  return Array.from(folder, (character) => character.charCodeAt(0)).some(isControlCode)
    ? 'The folder cannot contain control characters'
    : undefined
}

function isControlCode(code: number): boolean {
  return code < FIRST_PRINTABLE_CODE || code === DELETE_CODE
}

// Every folder that holds a connection, with the folders around it, in order.
export function connectionFolders(connections: readonly ConnectionConfig[]): string[] {
  return folderPathsOf(connections.map(({ folder }) => normalizeFolder(folder)))
}

// The connections of a folder (the top for an empty path), by name, and the folders right inside it.
export function folderNode(connections: readonly ConnectionConfig[], path: string): FolderNode {
  return {
    path,
    name: folderName(path),
    folders: childFolders(connectionFolders(connections), path),
    connections: connections
      .filter((connection) => normalizeFolder(connection.folder) === path)
      .toSorted((left, right) => left.name.localeCompare(right.name)),
  }
}

// The connections that move when a folder is renamed (or moved): those inside it, with the folder
// part of their path replaced.
export function renamedFolder(
  connections: readonly ConnectionConfig[],
  { from, to }: { readonly from: string; readonly to: string },
): ConnectionConfig[] {
  return connections
    .filter((connection) => isWithin(normalizeFolder(connection.folder), from))
    .map((connection) => ({
      ...connection,
      folder: normalizeFolder(
        `${to}${FOLDER_SEPARATOR}${normalizeFolder(connection.folder).slice(from.length)}`,
      ),
    }))
}

// Deleting a folder deletes no connection: those inside it move to the folder around it, with the
// folders inside it.
export function deletedFolder(
  connections: readonly ConnectionConfig[],
  path: string,
): ConnectionConfig[] {
  return renamedFolder(connections, { from: path, to: parentFolder(path) })
}
