import type { Analysis } from './analysis.ts'
import { type Fragment, loadFragments } from './fragment.ts'

// The fragments of the last run of CI on the base branch, which the report compares with; empty
// when there is none (no run yet, artifacts expired, API error): the deltas are then n/a.
export interface Baseline {
  readonly name: string
  readonly fragments: ReadonlyMap<Analysis, Fragment>
  // The link to that run, or empty.
  readonly runUrl: string
}

export interface BaselineSource {
  readonly directory: string | undefined
  readonly name: string
  readonly runUrl: string
}

export async function loadBaseline({ directory, name, runUrl }: BaselineSource): Promise<Baseline> {
  const fragments = directory === undefined ? new Map() : await loadFragments(directory)
  return { name, fragments, runUrl }
}

export function baselineNote({ name, fragments, runUrl }: Baseline): string {
  if (fragments.size === 0) {
    return `no \`${name}\` baseline: deltas are n/a`
  }
  const run = `last \`${name}\` run`
  return runUrl === '' ? `compared with the ${run}` : `compared with the [${run}](${runUrl})`
}
