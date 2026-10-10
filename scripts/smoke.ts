// Extension smoke test: launches a real VS Code with the built extension (dist/, `npm run build`) and
// runs test/smoke/suite.ts inside it. Linux needs a display: CI wraps it in xvfb-run.
//
//   SMOKE_VSCODE_VERSION  VS Code version to download and run (default: stable)
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runTests } from '@vscode/test-electron'
import { build } from 'esbuild'

import { removeDirectory, writeText } from './shared/files.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SMOKE_DIRECTORY = join(ROOT, '.vscode-test', 'smoke')
const SUITE_BUNDLE = join(SMOKE_DIRECTORY, 'suite.cjs')
const USER_DATA_DIRECTORY = join(SMOKE_DIRECTORY, 'user-data')
const VSCODE_VERSION = process.env['SMOKE_VSCODE_VERSION'] ?? 'stable'
// A fresh profile on every run, without telemetry and without the AI features, whose background
// services only add noise to the log.
const USER_SETTINGS = {
  'chat.disableAIFeatures': true,
  'telemetry.telemetryLevel': 'off',
  'workbench.startupEditor': 'none',
}

await removeDirectory(SMOKE_DIRECTORY)
await writeText(join(USER_DATA_DIRECTORY, 'User', 'settings.json'), JSON.stringify(USER_SETTINGS))
await build({
  entryPoints: [join(ROOT, 'test', 'smoke', 'suite.ts')],
  outfile: SUITE_BUNDLE,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['vscode'],
  logLevel: 'warning',
})

console.log(`>> launching VS Code ${VSCODE_VERSION} with the extension under development`)
try {
  await runTests({
    version: VSCODE_VERSION,
    extensionDevelopmentPath: ROOT,
    extensionTestsPath: SUITE_BUNDLE,
    launchArgs: [
      '--disable-extensions',
      '--disable-gpu',
      '--disable-telemetry',
      `--user-data-dir=${USER_DATA_DIRECTORY}`,
    ],
  })
  console.log('>> smoke OK')
} catch (error) {
  console.error(`>> smoke FAILED: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
