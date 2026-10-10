// Extension smoke test: installs the packaged extension (<name>-<version>.vsix, `npm run package`)
// in a real VS Code and runs test/smoke/suite.ts inside it, so that what is tested is what would be
// published. Linux needs a display: CI wraps it in xvfb-run.
//
//   SMOKE_VSCODE_VERSION  VS Code version to download and run (default: stable)
//   SMOKE_VSIX            the package to install (default: <name>-<version>.vsix)
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runTests, runVSCodeCommand } from '@vscode/test-electron'
import { build } from 'esbuild'

import manifest from '../package.json' with { type: 'json' }
import { removeDirectory, writeText } from './shared/files.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SMOKE_DIRECTORY = join(ROOT, '.vscode-test', 'smoke')
const SUITE_BUNDLE = join(SMOKE_DIRECTORY, 'suite.cjs')
const USER_DATA_DIRECTORY = join(SMOKE_DIRECTORY, 'user-data')
const EXTENSIONS_DIRECTORY = join(SMOKE_DIRECTORY, 'extensions')
// VS Code runs a test suite from an extension under development: an empty one here, so that the
// sqldoro it finds is the one installed from the package.
const HOST_DIRECTORY = join(SMOKE_DIRECTORY, 'host')
const HOST_MANIFEST = {
  name: 'sqldoro-smoke-host',
  publisher: 'sqldoro',
  version: '0.0.0',
  engines: manifest.engines,
}
const VSCODE_VERSION = process.env['SMOKE_VSCODE_VERSION'] ?? 'stable'
const VSIX = process.env['SMOKE_VSIX'] ?? join(ROOT, `${manifest.name}-${manifest.version}.vsix`)
// A fresh profile on every run, without telemetry and without the AI features, whose background
// services only add noise to the log.
const USER_SETTINGS = {
  'chat.disableAIFeatures': true,
  'telemetry.telemetryLevel': 'off',
  'workbench.startupEditor': 'none',
}
const PROFILE = [
  `--extensions-dir=${EXTENSIONS_DIRECTORY}`,
  `--user-data-dir=${USER_DATA_DIRECTORY}`,
]

await removeDirectory(SMOKE_DIRECTORY)
await writeText(join(USER_DATA_DIRECTORY, 'User', 'settings.json'), JSON.stringify(USER_SETTINGS))
await writeText(join(HOST_DIRECTORY, 'package.json'), JSON.stringify(HOST_MANIFEST))
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

console.log(`>> installing ${basename(VSIX)} in VS Code ${VSCODE_VERSION}`)
try {
  await runVSCodeCommand(['--install-extension', VSIX, ...PROFILE], { version: VSCODE_VERSION })
  await runTests({
    version: VSCODE_VERSION,
    extensionDevelopmentPath: HOST_DIRECTORY,
    extensionTestsPath: SUITE_BUNDLE,
    extensionTestsEnv: { SQLDORO_SMOKE_EXTENSIONS: EXTENSIONS_DIRECTORY },
    launchArgs: ['--disable-gpu', '--disable-telemetry', ...PROFILE],
  })
  console.log('>> smoke OK')
} catch (error) {
  console.error(`>> smoke FAILED: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
