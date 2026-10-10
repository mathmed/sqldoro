// The files the extension manifest (package.json) names: its entry point, its icons and the media
// of its walkthrough steps. A .vsix that misses one of them installs, then breaks at run time.
const CODICON = /^\$\([\w~-]+\)$/u
const EXTENSION_ROOT = 'extension/'
const CURRENT_FOLDER = './'

type JsonRecord = ReadonlyMap<string, unknown>

function recordOf(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? new Map(Object.entries(value))
    : new Map()
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

// A path, or the light, dark and high contrast paths of a themed icon or image.
function pathsOf(value: unknown): string[] {
  if (typeof value === 'string') {
    return CODICON.test(value) ? [] : [value]
  }
  return [...recordOf(value).values()].filter((path) => typeof path === 'string')
}

// views and viewsContainers group their entries by location: { "activitybar": [{ "icon": ... }] }.
function groupedIcons(value: unknown): string[] {
  return [...recordOf(value).values()]
    .flatMap(listOf)
    .flatMap((entry) => pathsOf(recordOf(entry).get('icon')))
}

function walkthroughMedia(value: unknown): string[] {
  return listOf(value)
    .flatMap((walkthrough) => listOf(recordOf(walkthrough).get('steps')))
    .flatMap((step) => {
      const media = recordOf(recordOf(step).get('media'))
      return ['image', 'svg', 'markdown'].flatMap((kind) => pathsOf(media.get(kind)))
    })
}

function commandIcons(value: unknown): string[] {
  return listOf(value).flatMap((command) => pathsOf(recordOf(command).get('icon')))
}

// The archive path of a file of the extension: "./dist/extension.cjs" is "extension/dist/extension.cjs".
function inPackage(path: string): string {
  return (
    EXTENSION_ROOT + (path.startsWith(CURRENT_FOLDER) ? path.slice(CURRENT_FOLDER.length) : path)
  )
}

export function manifestFiles(manifest: unknown): string[] {
  const root = recordOf(manifest)
  const contributes = recordOf(root.get('contributes'))
  const paths = [
    ...pathsOf(root.get('main')),
    ...pathsOf(root.get('icon')),
    ...groupedIcons(contributes.get('viewsContainers')),
    ...groupedIcons(contributes.get('views')),
    ...commandIcons(contributes.get('commands')),
    ...walkthroughMedia(contributes.get('walkthroughs')),
  ]
  return [...new Set(paths.map(inPackage))]
}
