import { join } from 'node:path'

import { listFiles, readText, writeText } from '../shared/files.ts'
import { field, NUMBER, parseObject, STRING } from '../shared/json.ts'
import { compareText } from '../shared/text.ts'
import { type Analysis, isAnalysis } from './analysis.ts'

const FRAGMENT_EXTENSION = '.json'

export interface Fragment {
  readonly analysis: Analysis
  readonly exitCode: number
  readonly output: string
  readonly seconds: number
}

export function hasPassed(fragment: Fragment): boolean {
  return fragment.exitCode === 0
}

export async function writeFragment(directory: string, fragment: Fragment): Promise<void> {
  const path = join(directory, `${fragment.analysis}${FRAGMENT_EXTENSION}`)
  await writeText(path, JSON.stringify(fragment))
}

export function parseFragment(text: string): Fragment {
  const fragment = parseObject(JSON.parse(text))
  const analysis = field(fragment, 'analysis', STRING)
  if (!isAnalysis(analysis)) {
    throw new TypeError(`unknown analysis "${analysis}"`)
  }
  return {
    analysis,
    exitCode: field(fragment, 'exitCode', NUMBER),
    output: field(fragment, 'output', STRING),
    seconds: field(fragment, 'seconds', NUMBER),
  }
}

export async function loadFragments(directory: string): Promise<ReadonlyMap<Analysis, Fragment>> {
  const names = (await listFiles(directory)).filter((name) => name.endsWith(FRAGMENT_EXTENSION))
  const fragments = await Promise.all(
    names.toSorted(compareText).map(async (name) => readFragment(join(directory, name))),
  )
  return new Map(
    fragments
      .filter((fragment) => fragment !== undefined)
      .map((fragment): [Analysis, Fragment] => [fragment.analysis, fragment]),
  )
}

async function readFragment(path: string): Promise<Fragment | undefined> {
  const text = await readText(path)
  try {
    return parseFragment(text)
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) {
      throw error
    }
    console.warn(`ignoring invalid fragment ${path}: ${error.message}`)
    return undefined
  }
}
