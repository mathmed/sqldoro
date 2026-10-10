import { parseArgs } from 'node:util'

import type { MutantResult } from '@stryker-mutator/api/core'

import { appendText } from '../shared/files.ts'
import {
  formatResultLine,
  hasReachedMinScore,
  type MutationResult,
} from '../shared/mutation-result.ts'
import { mutationTargets } from './scope.ts'
import { scoreMutants, skippedResult } from './score.ts'
import { renderSummary } from './summary.ts'

// A ratchet the owner raises over time; CI reads it from the MUTATION_MIN_SCORE repository variable.
const DEFAULT_MIN_SCORE = 95
const DEFAULT_BASE = 'origin/main'
const USAGE_ERROR = 2
const NOTHING_TO_MUTATE = 'No core file changed: nothing to mutate.'
const USAGE = `usage:
  mutation changed [--base <ref>]   mutate the core files changed since <ref> (default ${DEFAULT_BASE})
  mutation full                     mutate the whole core`

export interface MutationRunner {
  readonly runMutationTest: (mutate: string[] | undefined) => Promise<readonly MutantResult[]>
  readonly changedFiles: (baseRef: string) => Promise<readonly string[]>
  readonly mutatePatterns: () => Promise<readonly string[]>
}

export interface MutationContext {
  readonly runner: MutationRunner
  readonly environment: NodeJS.ProcessEnv
  readonly root: string
}

export async function main(argv: readonly string[], context: MutationContext): Promise<number> {
  const [command, ...args] = argv
  switch (command) {
    case 'changed':
      return mutateChanged(args, context)
    case 'full':
      return publish(await mutate(undefined, context), context)
    default:
      console.error(`unknown command "${String(command)}"\n${USAGE}`)
      return USAGE_ERROR
  }
}

async function mutateChanged(args: readonly string[], context: MutationContext): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { base: { type: 'string', default: DEFAULT_BASE } },
  })
  const files = await context.runner.changedFiles(values.base)
  const targets = mutationTargets(files, await context.runner.mutatePatterns())
  if (targets.length === 0) {
    return publish(skippedResult(NOTHING_TO_MUTATE, minScore(context.environment)), context)
  }
  console.log(`Mutating:\n  ${targets.join('\n  ')}`)
  return publish(await mutate(targets, context), context)
}

async function mutate(
  targets: string[] | undefined,
  context: MutationContext,
): Promise<MutationResult> {
  const mutants = await context.runner.runMutationTest(targets)
  return scoreMutants(mutants, { minScore: minScore(context.environment), root: context.root })
}

async function publish(result: MutationResult, { environment }: MutationContext): Promise<number> {
  const summary = renderSummary(result)
  console.log(summary)
  const summaryFile = environment['GITHUB_STEP_SUMMARY'] ?? ''
  if (summaryFile !== '') {
    await appendText(summaryFile, summary)
  }
  console.log(formatResultLine(result))
  return hasReachedMinScore(result) ? 0 : 1
}

function minScore(environment: NodeJS.ProcessEnv): number {
  const configured = environment['MUTATION_MIN_SCORE'] ?? ''
  if (configured === '') {
    return DEFAULT_MIN_SCORE
  }
  const value = Number(configured)
  if (!Number.isFinite(value)) {
    throw new TypeError(`MUTATION_MIN_SCORE must be a number, got "${configured}"`)
  }
  return value
}
