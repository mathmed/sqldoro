import { build } from 'esbuild'

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
} catch (error) {
  // esbuild has already printed every error; its stack trace would only repeat them.
  if (!(error instanceof Error && 'errors' in error)) {
    throw error
  }
  process.exitCode = 1
}
