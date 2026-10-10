import { build } from 'esbuild'
import { build as buildWebview } from 'vite'

import { fileSize } from './shared/files.ts'
import { formatBytes } from './shared/text.ts'

const WEBVIEW_ROOT = 'src/webview'
const WEBVIEW_OUTPUT = 'dist/webview'
// Each webview is a bundle of its own: one script and one stylesheet named after it, which the
// extension loads into the page it gives the webview (src/extension/webview-page.ts).
const WEBVIEWS = [
  { name: 'results', entry: 'main.tsx' },
  { name: 'connection-form', entry: 'connection-form/main.tsx' },
] as const
const WEBVIEW_FILES = ['results.js', 'results.css', 'connection-form.js', 'connection-form.css']
// React and TanStack mark their modules "use client" for server components, which a webview has not.
const IGNORED_LOGS: ReadonlySet<string> = new Set(['MODULE_LEVEL_DIRECTIVE'])

type Webview = (typeof WEBVIEWS)[number]

// Built one at a time, so that no chunk is shared: the page of a webview runs only the script with
// its nonce, and an import of another chunk would be refused by its Content Security Policy.
async function bundleWebview({ name, entry }: Webview, isFirst: boolean): Promise<void> {
  await buildWebview({
    configFile: false,
    root: WEBVIEW_ROOT,
    logLevel: 'warn',
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
}

try {
  // VS Code loads the extension with require() in its Node.js 24 extension host.
  await build({
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
    logLevel: 'info',
  })
  for (const [index, webview] of WEBVIEWS.entries()) {
    await bundleWebview(webview, index === 0)
  }
  // The same lines as esbuild's summary, for the Quality Report.
  for (const file of WEBVIEW_FILES) {
    const path = `${WEBVIEW_OUTPUT}/${file}`
    console.log(`  ${path}  ${formatBytes(await fileSize(path))}`)
  }
} catch (error) {
  // esbuild and Vite have already printed every error; the stack trace would only repeat them.
  if (!(error instanceof Error && ('errors' in error || 'plugin' in error))) {
    throw error
  }
  process.exitCode = 1
}
