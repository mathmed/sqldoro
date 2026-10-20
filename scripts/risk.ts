// Risk label of a pull request (see "The risk label" in CONTRIBUTING.md).
//   check --labels-json <json>     fails unless the labels hold exactly one known risk:<level> label
import { main } from './risk/cli.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = main(process.argv.slice(ARGUMENTS_START))
