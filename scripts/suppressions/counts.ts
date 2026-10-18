import { parseObject } from '../shared/json.ts'
import { compareText } from '../shared/text.ts'
import { isSuppressionKind, kindOrder, type SuppressionKind } from './kinds.ts'
import type { Occurrence } from './scan.ts'

// The indentation Prettier keeps for JSON files.
const JSON_INDENT = 2

// How many suppressions of each kind each file has: the committed baseline and the current scan.
export type Counts = ReadonlyMap<string, ReadonlyMap<SuppressionKind, number>>

export interface Change {
  readonly path: string
  readonly kind: SuppressionKind
  readonly baseline: number
  readonly current: number
  readonly lines: readonly number[]
}

export function countOccurrences(occurrences: readonly Occurrence[]): Counts {
  const counts = new Map<string, Map<SuppressionKind, number>>()
  for (const { path, kind } of occurrences) {
    const kinds = counts.get(path) ?? new Map<SuppressionKind, number>()
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    counts.set(path, kinds)
  }
  return counts
}

function countOf(counts: Counts, path: string, kind: SuppressionKind): number {
  return counts.get(path)?.get(kind) ?? 0
}

export function totalOf(counts: Counts): number {
  return [...counts.values()].reduce((sum, kinds) => sum + sumOf(kinds.values()), 0)
}

export function totalsByKind(counts: Counts): ReadonlyMap<SuppressionKind, number> {
  const totals = new Map<SuppressionKind, number>()
  for (const kinds of counts.values()) {
    for (const [kind, count] of kinds) {
      totals.set(kind, (totals.get(kind) ?? 0) + count)
    }
  }
  return new Map([...totals].toSorted(([left], [right]) => kindOrder(left) - kindOrder(right)))
}

// Every (file, kind) whose count differs from the baseline, in file order.
export function changesOf(occurrences: readonly Occurrence[], baseline: Counts): Change[] {
  const current = countOccurrences(occurrences)
  return keysOf(current, baseline)
    .map(([path, kind]) => ({
      path,
      kind,
      baseline: countOf(baseline, path, kind),
      current: countOf(current, path, kind),
      lines: occurrences
        .filter((occurrence) => occurrence.path === path && occurrence.kind === kind)
        .map((occurrence) => occurrence.line),
    }))
    .filter((change) => change.current !== change.baseline)
}

export function isIncrease(change: Change): boolean {
  return change.current > change.baseline
}

function keysOf(current: Counts, baseline: Counts): [string, SuppressionKind][] {
  const keys = new Map<string, Set<SuppressionKind>>()
  for (const [path, kinds] of [...current, ...baseline]) {
    keys.set(path, new Set([...(keys.get(path) ?? []), ...kinds.keys()]))
  }
  return [...keys]
    .toSorted(([left], [right]) => compareText(left, right))
    .flatMap(([path, kinds]) =>
      [...kinds]
        .toSorted((left, right) => kindOrder(left) - kindOrder(right))
        .map((kind): [string, SuppressionKind] => [path, kind]),
    )
}

function sumOf(values: Iterable<number>): number {
  return [...values].reduce((sum, value) => sum + value, 0)
}

// suppressions-baseline.json: { "<file>": { "<kind>": <count> } }, files and kinds sorted.
export function parseBaseline(text: string): Counts {
  const files = parseObject(JSON.parse(text))
  return new Map([...files].map(([path, kinds]) => [path, parseKinds(path, kinds)]))
}

function parseKinds(path: string, value: unknown): ReadonlyMap<SuppressionKind, number> {
  return new Map(
    [...parseObject(value)].map(([kind, count]): [SuppressionKind, number] => {
      if (!isSuppressionKind(kind)) {
        throw new TypeError(`unknown suppression kind "${kind}" for ${path} in the baseline`)
      }
      if (!Number.isSafeInteger(count) || Number(count) < 1) {
        throw new TypeError(`expected a positive count of ${kind} for ${path} in the baseline`)
      }
      return [kind, Number(count)]
    }),
  )
}

export function formatBaseline(counts: Counts): string {
  const files = [...counts]
    .toSorted(([left], [right]) => compareText(left, right))
    .map(([path, kinds]) => [path, Object.fromEntries(sortedKinds(kinds))] as const)
  return `${JSON.stringify(Object.fromEntries(files), undefined, JSON_INDENT)}\n`
}

function sortedKinds(kinds: ReadonlyMap<SuppressionKind, number>): [SuppressionKind, number][] {
  return [...kinds].toSorted(([left], [right]) => kindOrder(left) - kindOrder(right))
}
