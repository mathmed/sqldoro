// File hygiene: what pre-commit's trailing-whitespace, end-of-file-fixer and
// check-added-large-files hooks check (see "File hygiene" in CONTRIBUTING.md).
//   check [--base <ref>]   fails on trailing whitespace, a missing or extra final newline, and on a
//                          file above 500kb added since <ref> (without it: added in the index)
//   fix [<file>...]        fixes the whitespace and final newline of the files (default: all)
import { main } from './hygiene/cli.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), { root: process.cwd() })
