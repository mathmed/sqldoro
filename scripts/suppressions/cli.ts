import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { readOptionalText, readText, writeText } from '../shared/files.ts'
import { workingTreeFiles } from '../shared/git-files.ts'
import { formatSuppressionsLine } from '../shared/suppressions-result.ts'
import {
  changesOf,
  countOccurrences,
  type Counts,
  formatBaseline,
  parseBaseline,
} from './counts.ts'
import { type Comparison, increasesOf, reportLines, resultOf } from './report.ts'
import { compareOccurrences, type Occurrence, scanSource } from './scan.ts'

const DEFAULT_BASELINE = 'suppressions-baseline.json'
const SOURCE_EXTENSIONS: readonly string[] = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]
const USAGE_ERROR = 2
const USAGE = `usage:
  suppressions check [--baseline <file>]
      fail when the suppressions differ from the baseline (default ${DEFAULT_BASELINE})
  suppressions update [--baseline <file>] [--allow-increase]
      rewrite the baseline with the current counts; raising it needs --allow-increase`

// The repository the suppressions are counted in: every source file git knows or would add.
export interface SuppressionsContext {
  readonly root: string
}

export async function main(argv: readonly string[], context: SuppressionsContext): Promise<number> {
  const [command = '', ...args] = argv
  const { values } = parseArgs({
    args: [...args],
    options: {
      baseline: { type: 'string', default: DEFAULT_BASELINE },
      'allow-increase': { type: 'boolean', default: false },
    },
  })
  const baselinePath = join(context.root, values.baseline)
  if (command === 'check') {
    return check(await compare(context.root, baselinePath))
  }
  if (command === 'update') {
    return update(await compare(context.root, baselinePath), {
      baselinePath,
      canIncrease: values['allow-increase'],
    })
  }
  console.error(`unknown command "${command}"\n${USAGE}`)
  return USAGE_ERROR
}

function check(comparison: Comparison): number {
  console.log(reportLines(comparison).join('\n'))
  console.log(formatSuppressionsLine(resultOf(comparison)))
  if (comparison.changes.length > 0) {
    return 1
  }
  console.log('Suppressions match the baseline.')
  return 0
}

interface UpdateOptions {
  readonly baselinePath: string
  readonly canIncrease: boolean
}

async function update(comparison: Comparison, options: UpdateOptions): Promise<number> {
  console.log(reportLines(comparison).join('\n'))
  if (increasesOf(comparison).length > 0 && !options.canIncrease) {
    console.error(
      'Refusing to raise the baseline: pass --allow-increase only with the owner’s approval.',
    )
    return 1
  }
  await writeText(options.baselinePath, formatBaseline(comparison.current))
  console.log(`Baseline written to ${options.baselinePath}.`)
  return 0
}

async function compare(root: string, baselinePath: string): Promise<Comparison> {
  const occurrences = await scan(root)
  const baseline = await loadBaseline(baselinePath)
  return {
    current: countOccurrences(occurrences),
    baseline,
    changes: changesOf(occurrences, baseline),
  }
}

async function scan(root: string): Promise<Occurrence[]> {
  const files = (await workingTreeFiles(root)).filter(isSource)
  const scanned = await Promise.all(
    files.map(async (file) => scanSource(file, await readText(join(root, file)))),
  )
  return scanned.flat().toSorted(compareOccurrences)
}

function isSource(file: string): boolean {
  return SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))
}

// No baseline yet counts as no suppression allowed.
async function loadBaseline(path: string): Promise<Counts> {
  const text = await readOptionalText(path)
  return text === undefined ? new Map() : parseBaseline(text)
}
