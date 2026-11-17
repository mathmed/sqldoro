import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { readText } from '../shared/files.ts'
import { fileAtMergeBase } from '../shared/git-files.ts'
import { plural } from '../shared/text.ts'
import { type ContractChange, contractChanges, Severity } from './diff.ts'
import { readContract } from './manifest.ts'

const MANIFEST = 'package.json'
const DEFAULT_BASE = 'origin/main'
const USAGE_ERROR = 2
const USAGE = `usage:
  contract check [--base <ref>]
      fail when the contributed commands, views, view containers or settings of ${MANIFEST} lose
      something they had at the merge base with <ref> (default ${DEFAULT_BASE})`
const LABELS: ReadonlyMap<Severity, string> = new Map([
  [Severity.Breaking, 'Breaking'],
  [Severity.Added, 'Added'],
])

// The repository whose manifest is compared with the one of the base branch.
export interface ContractContext {
  readonly root: string
}

export async function main(argv: readonly string[], context: ContractContext): Promise<number> {
  const [command, ...args] = argv
  const { values } = parseArgs({
    args: [...args],
    options: { base: { type: 'string', default: DEFAULT_BASE } },
  })
  if (command !== 'check') {
    console.error(`unknown command "${String(command)}"\n${USAGE}`)
    return USAGE_ERROR
  }
  return check(context.root, values.base)
}

async function check(root: string, base: string): Promise<number> {
  const changes = contractChanges(
    readContract(await fileAtMergeBase(root, base, MANIFEST)),
    readContract(await readText(join(root, MANIFEST))),
  )
  for (const { severity, item, detail } of changes) {
    console.log(`${String(LABELS.get(severity))}: ${item} ${detail}`)
  }
  const breaking = countOf(changes, Severity.Breaking)
  const added = plural(countOf(changes, Severity.Added), 'addition', 'additions')
  console.log(
    `Contract: ${plural(breaking, 'breaking change', 'breaking changes')}, ${added} against ${base}.`,
  )
  return breaking === 0 ? 0 : 1
}

function countOf(changes: readonly ContractChange[], severity: Severity): number {
  return changes.filter((change) => change.severity === severity).length
}
