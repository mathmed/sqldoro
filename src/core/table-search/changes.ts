import type { FoundBranch, FoundTables } from './found.ts'
import { emptyFindText } from './status.ts'

// What the tree of what was found must draw again after the text or the index changed: the whole
// tree when its top changed, otherwise the branches that look different or whose children changed
// (which ones, or how the tables and views among them look), none inside another. Reading a branch
// again reads what is open under it, so the nodes that stay are updated in place, keep their state
// and do not flicker.
export interface FoundChanges {
  readonly isRootChanged: boolean
  readonly keys: ReadonlySet<string>
}

export const NO_CHANGES: FoundChanges = { isRootChanged: false, keys: new Set() }

export function foundChanges(before: FoundTables, after: FoundTables): FoundChanges {
  if (rootLook(before) !== rootLook(after)) {
    return { isRootChanged: true, keys: new Set() }
  }
  const earlier = new Map<string, string>()
  remember(before.roots, earlier)
  const keys = new Set<string>()
  collect(after.roots, { earlier, keys })
  return { isRootChanged: false, keys }
}

// Changes gathered while the tree waits to be told: everything either asks to draw again.
export function mergeChanges(first: FoundChanges, second: FoundChanges): FoundChanges {
  return {
    isRootChanged: first.isRootChanged || second.isRootChanged,
    keys: new Set([...first.keys, ...second.keys]),
  }
}

// What a node shows: a group its count, a table or view the text highlighted in its name.
function lookOf({ key, name, count, highlights }: FoundBranch): unknown[] {
  return [key, name, count, highlights]
}

// What drawing a branch again updates: its own look, which children it has, and how the tables
// and views among them look (a branch under it is compared on its own).
function signatureOf(found: FoundBranch): string {
  const children = found.children.map((child) =>
    child.children.length === 0 ? lookOf(child) : child.key,
  )
  return JSON.stringify([lookOf(found), children])
}

// The top of the tree: its connections, or the line it shows without any.
function rootLook(found: FoundTables): string {
  return JSON.stringify(found.roots.length > 0 ? found.roots.map(lookOf) : emptyFindText(found))
}

function remember(branches: readonly FoundBranch[], earlier: Map<string, string>): void {
  for (const found of branches) {
    earlier.set(found.key, signatureOf(found))
    remember(found.children, earlier)
  }
}

interface Collected {
  readonly earlier: ReadonlyMap<string, string>
  readonly keys: Set<string>
}

function collect(branches: readonly FoundBranch[], collected: Collected): void {
  for (const found of branches) {
    if (collected.earlier.get(found.key) === signatureOf(found)) {
      collect(found.children, collected)
    } else {
      collected.keys.add(found.key)
    }
  }
}
