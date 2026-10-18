import type { SuppressionsResult } from '../shared/suppressions-result.ts'
import { type Change, type Counts, isIncrease, totalOf, totalsByKind } from './counts.ts'

export interface Comparison {
  readonly current: Counts
  readonly baseline: Counts
  readonly changes: readonly Change[]
}

export function increasesOf(comparison: Comparison): Change[] {
  return comparison.changes.filter(isIncrease)
}

export function decreasesOf(comparison: Comparison): Change[] {
  return comparison.changes.filter((change) => !isIncrease(change))
}

export function reportLines(comparison: Comparison): string[] {
  const totals = [...totalsByKind(comparison.current)]
  return [
    `Suppressions: ${String(totalOf(comparison.current))} (baseline ${String(totalOf(comparison.baseline))})`,
    ...totals.map(([kind, count]) => `  ${kind}: ${String(count)}`),
    ...section(
      'New suppressions (remove them, or get the owner’s approval to raise the baseline):',
      increasesOf(comparison),
    ),
    ...section(
      'Suppressions removed (lock the improvement in with `make suppressions-update`):',
      decreasesOf(comparison),
    ),
  ]
}

function section(title: string, changes: readonly Change[]): string[] {
  return changes.length === 0 ? [] : [title, ...changes.map(describe)]
}

function describe({ path, kind, baseline, current, lines }: Change): string {
  const where = lines.length === 0 ? '-' : lines.join(', ')
  return `  ${path}: ${kind} ${String(baseline)} -> ${String(current)} (lines: ${where})`
}

export function resultOf(comparison: Comparison): SuppressionsResult {
  return {
    total: totalOf(comparison.current),
    baselineTotal: totalOf(comparison.baseline),
    totals: [...totalsByKind(comparison.current)].map(([kind, count]) => ({ kind, count })),
    changes: comparison.changes,
  }
}
