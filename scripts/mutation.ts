// Mutation testing with Stryker (see CONTRIBUTING.md).
//   changed [--base <ref>]   mutates only the core declarations changed since <ref>: the PR job
//   full                     mutates the whole core: the weekly run
// Prints the score, the survivors and a MUTATION_RESULT line for the Quality Report, and fails
// below MUTATION_MIN_SCORE.
import { join } from 'node:path'

import { Stryker } from '@stryker-mutator/core'

import { main } from './mutation/cli.ts'
import { loadMutatePatterns } from './mutation/scope.ts'
import { readText } from './shared/files.ts'
import { changedFiles, unifiedDiff } from './shared/git-files.ts'

const STRYKER_CONFIG = new URL('../stryker.config.mjs', import.meta.url)
// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), {
  runner: {
    runMutationTest: async (mutate) =>
      new Stryker(mutate === undefined ? {} : { mutate }).runMutationTest(),
    changedFiles: async (baseRef) => changedFiles(process.cwd(), baseRef),
    diff: async (baseRef, files) => unifiedDiff(process.cwd(), baseRef, files),
    readSource: async (file) => readText(join(process.cwd(), file)),
    mutatePatterns: async () => loadMutatePatterns(STRYKER_CONFIG),
  },
  environment: process.env,
  root: process.cwd(),
})
