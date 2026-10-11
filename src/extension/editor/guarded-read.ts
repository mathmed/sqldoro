import type * as vscode from 'vscode'

import type { QueryResult } from '../../core/engine/query.ts'
import { describeError } from '../../core/text/errors.ts'
import type { QueryRunner } from './query-runner.ts'
import { type ApprovedRead, runApprovedRead } from './run-job.ts'
import type { RunParts, RunTarget } from './run-types.ts'

// What a read gave: its result, or why it failed, for people.
export type ReadOutcome = { readonly result: QueryResult } | { readonly problem: string }

// Reads that bring their rows to the host (a peek, a count), through the guards like any run of
// the source and on its session, one after the other. Undefined when they did not run: the guards
// refused them, or the source has nothing to read.
export async function readThroughGuards(
  runner: QueryRunner,
  source: vscode.Uri,
  plan: (target: RunTarget) => Promise<readonly ApprovedRead[] | undefined>,
): Promise<readonly ReadOutcome[] | undefined> {
  let outcomes: readonly ReadOutcome[] | undefined
  await runner.perform(source, async (target) => {
    const reads = await plan(target)
    return reads === undefined
      ? undefined
      : {
          statements: reads.map(({ sql }) => sql),
          run: async (parts) => {
            outcomes = await readEach(parts, reads)
          },
        }
  })
  return outcomes
}

async function readEach(
  parts: RunParts,
  reads: readonly ApprovedRead[],
): Promise<readonly ReadOutcome[]> {
  const outcomes: ReadOutcome[] = []
  for (const read of reads) {
    outcomes.push(await readOne(parts, read))
  }
  return outcomes
}

async function readOne(parts: RunParts, read: ApprovedRead): Promise<ReadOutcome> {
  try {
    return { result: await runApprovedRead(parts, read) }
  } catch (error) {
    return { problem: describeError(error) }
  }
}
