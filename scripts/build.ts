import { build } from 'esbuild'
import { build as buildWebview } from 'vite'

import { fileSize } from './shared/files.ts'
import { formatBytes } from './shared/text.ts'

const WEBVIEW_ROOT = 'src/webview'
const WEBVIEW_OUTPUT = 'dist/webview'
const WEBVIEW_FILES = ['results.js', 'results.css']
// React and TanStack mark their modules "use client" for server components, which a webview has not.
const IGNORED_LOGS: ReadonlySet<string> = new Set(['MODULE_LEVEL_DIRECTIVE'])

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
  // The result webview: one script and one stylesheet with fixed names, which the extension loads
  // into the page it gives the webview (src/extension/results/results-html.ts).
  await buildWebview({
    configFile: false,
    root: WEBVIEW_ROOT,
    logLevel: 'warn',
    build: {
      outDir: `../../${WEBVIEW_OUTPUT}`,
      emptyOutDir: true,
      target: 'es2023',
      sourcemap: true,
      rolldownOptions: {
        input: `${WEBVIEW_ROOT}/main.tsx`,
        output: { entryFileNames: 'results.js', assetFileNames: 'results[extname]' },
        onLog: (level, log, handle) => {
          if (!IGNORED_LOGS.has(log.code ?? '')) {
            handle(level, log)
          }
        },
      },
    },
  })
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
