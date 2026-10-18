// Suppression ratchet (see "Suppression ratchet" in CONTRIBUTING.md).
//   check    fails when the suppressions in the source and the tests differ from the baseline
//   update   rewrites suppressions-baseline.json; raising it needs --allow-increase
// Prints the counts, the changes and a SUPPRESSIONS_RESULT line for the Quality Report.
import { main } from './suppressions/cli.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), { root: process.cwd() })
