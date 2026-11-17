// The public contract of the extension (see "The contract check" in CONTRIBUTING.md).
//   check [--base <ref>]   fails when package.json removes or renames a contributed command, view,
//                          view container or setting, or narrows a setting, against the merge base
import { main } from './contract/cli.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), { root: process.cwd() })
