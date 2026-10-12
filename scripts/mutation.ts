// Mutation testing with Stryker (see CONTRIBUTING.md).
//   changed [--base <ref>]   mutates only the core files changed since <ref>: what the PR job runs
//   full                     mutates the whole core: the weekly run
// Prints the score, the survivors and a MUTATION_RESULT line for the Quality Report, and fails
// below MUTATION_MIN_SCORE.
import { Stryker } from '@stryker-mutator/core'

import { changedFiles } from './mutation/changed-files.ts'
import { main } from './mutation/cli.ts'
import { loadMutatePatterns } from './mutation/scope.ts'

const STRYKER_CONFIG = new URL('../stryker.config.mjs', import.meta.url)
// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), {
  runner: {
    runMutationTest: async (mutate) =>
      new Stryker(mutate === undefined ? {} : { mutate }).runMutationTest(),
    changedFiles: async (baseRef) => changedFiles(process.cwd(), baseRef),
    mutatePatterns: async () => loadMutatePatterns(STRYKER_CONFIG),
  },
  environment: process.env,
  root: process.cwd(),
})
