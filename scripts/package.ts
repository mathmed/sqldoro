// Packs the built extension (dist/, `npm run build`) into <name>-<version>.vsix with vsce and checks
// what the package holds (see CONTRIBUTING.md). The package is reproducible: vsce
// sorts its files and dates them all at the last commit (SOURCE_DATE_EPOCH), so one commit always
// packs the same bytes.
//
//   SOURCE_DATE_EPOCH   the date of the files, in seconds (default: the time of the last commit)
import { createVSIX } from '@vscode/vsce'

import { main } from './package/cli.ts'
import { lastCommitTime } from './package/commit-time.ts'

process.exitCode = await main({
  pack: async (packagePath, sourceDateEpoch) => {
    process.env['SOURCE_DATE_EPOCH'] = sourceDateEpoch
    // The bundles hold the libraries: the package ships no node_modules.
    await createVSIX({ packagePath, dependencies: false })
  },
  lastCommitTime: async () => lastCommitTime(process.cwd()),
  environment: process.env,
  root: process.cwd(),
})
