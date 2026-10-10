// Release checks for .github/workflows/release.yml (see docs/RELEASING.md).
//   check --tag <vX.Y.Z> [--notes <file>]   the tag matches package.json and CHANGELOG.md dates its
//                                           section; writes that section as the release notes
import { main } from './release/cli.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), {
  root: process.cwd(),
  environment: process.env,
})
