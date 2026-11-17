// Labels of a pull request (see "The PR labels" in CONTRIBUTING.md).
//   check --labels-json <json>     fails unless the labels hold exactly one known risk:<level>
//                                  label and one known deploy:<kind> label
import { main } from './pr-labels/cli.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = main(process.argv.slice(ARGUMENTS_START))
