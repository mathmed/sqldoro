// Risk floors of a pull request (see "Risk floors and the risk label" in CONTRIBUTING.md).
//   floor [--base <ref>]                          prints the minimum risk level of the changes
//   check --labels-json <json> [--base <ref>]     fails unless the risk:<level> label reaches it
import { main } from './risk/cli.ts'
import { touchedFiles } from './shared/git-files.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), {
  root: process.cwd(),
  touchedFiles: async (baseRef) => touchedFiles(process.cwd(), baseRef),
})
