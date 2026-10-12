import { build } from 'esbuild'
import { build as buildWebview, type Plugin } from 'vite'

import { thirdPartyNotices } from './build/third-party.ts'
import { fileSize, writeText } from './shared/files.ts'
import { formatBytes } from './shared/text.ts'

const WEBVIEW_ROOT = 'src/webview'
const WEBVIEW_OUTPUT = 'dist/webview'
// Each webview is a bundle of its own: one script and one stylesheet named after it, which the
// extension loads into the page it gives the webview (src/extension/webview-page.ts).
const WEBVIEWS = [
  { name: 'results', entry: 'main.tsx' },
  { name: 'connection-form', entry: 'connection-form/main.tsx' },
] as const
const WEBVIEW_FILES = WEBVIEWS.flatMap(({ name }) => [`${name}.js`, `${name}.css`])
// The licenses and notices of the libraries the bundles hold, shipped in the .vsix.
const NOTICES = 'dist/ThirdPartyNotices.txt'
// React and TanStack mark their modules "use client" for server components, which a webview has not.
const IGNORED_LOGS: ReadonlySet<string> = new Set(['MODULE_LEVEL_DIRECTIVE'])

type Webview = (typeof WEBVIEWS)[number]

// Built one at a time, so that no chunk is shared: the page of a webview runs only the script with
// its nonce, and an import of another chunk would be refused by its Content Security Policy.
// Resolves with the modules the bundle holds.
async function bundleWebview({ name, entry }: Webview, isFirst: boolean): Promise<string[]> {
  const modules: string[] = []
  await buildWebview({
    configFile: false,
    root: WEBVIEW_ROOT,
    logLevel: 'warn',
    plugins: [collectModules(modules)],
    build: {
      outDir: `../../${WEBVIEW_OUTPUT}`,
      emptyOutDir: isFirst,
      target: 'es2023',
      sourcemap: true,
      rolldownOptions: {
        input: `${WEBVIEW_ROOT}/${entry}`,
        output: { entryFileNames: `${name}.js`, assetFileNames: `${name}[extname]` },
        onLog: (level, log, handle) => {
          if (!IGNORED_LOGS.has(log.code ?? '')) {
            handle(level, log)
          }
        },
      },
    },
  })
  return modules
}

// Adds the modules each chunk of the bundle holds to `modules`.
function collectModules(modules: string[]): Plugin {
  return {
    name: 'sqldoro-bundled-modules',
    generateBundle: (...[, bundle]) => {
      for (const output of Object.values(bundle)) {
        modules.push(...(output.type === 'chunk' ? output.moduleIds : []))
      }
    },
  }
}

// Writes the notices of the bundled libraries; a library sqldoro cannot ship fails the build.
async function writeNotices(modules: readonly string[]): Promise<void> {
  const notices = await thirdPartyNotices(modules, process.cwd())
  await writeText(NOTICES, notices.text)
  console.log(
    `  ${NOTICES}  ${formatBytes(await fileSize(NOTICES))}  (${String(notices.packageCount)} libraries)`,
  )
  for (const problem of notices.problems) {
    console.error(`✘ [ERROR] ${problem}`)
  }
  if (notices.problems.length > 0) {
    process.exitCode = 1
  }
}

try {
  // VS Code loads the extension with require() in its Node.js 24 extension host.
  const extension = await build({
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    // cpu-features is an optional native addon of ssh2, never built here (npm runs no install
    // scripts): ssh2 loads it in a try block and falls back to plain JavaScript without it.
    external: ['vscode', 'cpu-features'],
    minify: true,
    sourcemap: true,
    metafile: true,
    logLevel: 'info',
  })
  const modules = Object.keys(extension.metafile.inputs)
  for (const [index, webview] of WEBVIEWS.entries()) {
    modules.push(...(await bundleWebview(webview, index === 0)))
  }
  // The same lines as esbuild's summary, for the Quality Report.
  for (const file of WEBVIEW_FILES) {
    const path = `${WEBVIEW_OUTPUT}/${file}`
    console.log(`  ${path}  ${formatBytes(await fileSize(path))}`)
  }
  await writeNotices(modules)
} catch (error) {
  // esbuild and Vite have already printed every error; the stack trace would only repeat them.
  if (!(error instanceof Error && ('errors' in error || 'plugin' in error))) {
    throw error
  }
  process.exitCode = 1
}
