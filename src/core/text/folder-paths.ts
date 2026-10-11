// Folders as paths, for what the views group into folders (saved queries, connections):
// "reports/monthly" is the folder monthly inside the folder reports; empty is no folder.
export const FOLDER_SEPARATOR = '/'

// " reports / monthly/ " is "reports/monthly".
export function normalizeFolder(folder: string): string {
  return folder
    .split(FOLDER_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(FOLDER_SEPARATOR)
}

// Every folder of the list, with the folders above it, in order.
export function folderPathsOf(folders: readonly string[]): string[] {
  const paths = new Set<string>()
  for (const folder of folders) {
    const parts = folder === '' ? [] : folder.split(FOLDER_SEPARATOR)
    parts.forEach((...[, index]) => paths.add(parts.slice(0, index + 1).join(FOLDER_SEPARATOR)))
  }
  return [...paths].toSorted((left, right) => left.localeCompare(right, 'en'))
}

// The last part of a folder path: the name the folder shows under its parent.
export function folderName(folder: string): string {
  return folder.slice(folder.lastIndexOf(FOLDER_SEPARATOR) + 1)
}

// The folder around a folder; empty for a folder at the top.
export function parentFolder(folder: string): string {
  return folder.slice(0, Math.max(folder.lastIndexOf(FOLDER_SEPARATOR), 0))
}

// The paths right inside `folder` (the top for an empty one).
export function childFolders(paths: readonly string[], folder: string): string[] {
  const prefix = folder === '' ? '' : `${folder}${FOLDER_SEPARATOR}`
  return paths.filter(
    (path) => path.startsWith(prefix) && !path.slice(prefix.length).includes(FOLDER_SEPARATOR),
  )
}

// Whether a path is the folder, or a folder inside it.
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}${FOLDER_SEPARATOR}`)
}
