import { formatBytes } from '../shared/text.ts'
import { manifestFiles } from './manifest-files.ts'

// The glyphs of the engines on the connections of the Connections view: one per engine, connected
// or not, for light and dark themes (the extension names them in src/extension/tree/node-icons.ts).
const ENGINE_GLYPHS: readonly string[] = ['mysql', 'postgres'].flatMap((engine) =>
  ['connected', 'disconnected'].flatMap((state) =>
    ['light', 'dark'].map((theme) => `extension/media/explorer/${engine}-${state}-${theme}.svg`),
  ),
)

// What sqldoro's .vsix holds: what vsce writes (the manifests, the readme, the changelog and the
// license), the bundles (the extension and its three webviews), the notices of the bundled
// libraries and the media. .vscodeignore lists the same files: this check fails when the package
// and the list part ways.
export const VSIX_FILES: readonly string[] = [
  '[Content_Types].xml',
  'extension.vsixmanifest',
  'extension/package.json',
  'extension/readme.md',
  'extension/changelog.md',
  'extension/LICENSE.txt',
  'extension/dist/extension.cjs',
  'extension/dist/ThirdPartyNotices.txt',
  'extension/dist/webview/results.js',
  'extension/dist/webview/results.css',
  'extension/dist/webview/connection-form.js',
  'extension/dist/webview/connection-form.css',
  'extension/dist/webview/table-search.js',
  'extension/dist/webview/table-search.css',
  'extension/media/icon.png',
  'extension/media/sqldoro.svg',
  ...ENGINE_GLYPHS,
]
// Folders whose files may ship beside those above: the pages of the walkthrough.
const VSIX_FOLDERS: readonly string[] = ['extension/media/walkthrough/']
const BYTES_PER_KIB = 1024
// Twice the size of the package today: a bundle that doubles, or a source map or a folder of
// dependencies shipped by mistake, goes over it.
const BUDGET_KIB = 1536
export const VSIX_BUDGET_BYTES = BUDGET_KIB * BYTES_PER_KIB

export interface VsixContents {
  readonly names: readonly string[]
  // The package.json the package holds, as parsed.
  readonly manifest: unknown
  readonly bytes: number
}

export function vsixProblems({ names, manifest, bytes }: VsixContents): string[] {
  const held = new Set(names)
  return [
    ...VSIX_FILES.filter((name) => !held.has(name)).map((name) => `the package misses ${name}`),
    ...names
      .filter((name) => !isAllowed(name))
      .map((name) => `the package should not hold ${name}`),
    ...manifestFiles(manifest)
      .filter((name) => !held.has(name))
      .map((name) => `package.json names ${name}, which the package does not hold`),
    ...overBudget(bytes),
  ]
}

function isAllowed(name: string): boolean {
  return VSIX_FILES.includes(name) || VSIX_FOLDERS.some((folder) => name.startsWith(folder))
}

function overBudget(bytes: number): string[] {
  return bytes > VSIX_BUDGET_BYTES
    ? [
        `the package weighs ${formatBytes(bytes)}, over its budget of ${formatBytes(VSIX_BUDGET_BYTES)}`,
      ]
    : []
}
