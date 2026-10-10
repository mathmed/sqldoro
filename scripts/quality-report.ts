// Consolidated Quality Report (see "Quality Report" in the README).
//   run <analysis> -- <command>   runs a CI analysis, keeps its exit code and stores its fragment
//   render                        builds the single PR comment from the fragments
import { main } from './quality-report/cli.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), process.env)
