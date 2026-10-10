import { matchesGlob } from 'node:path'

import { ARRAY, field, parseObject } from '../shared/json.ts'
import { compareText } from '../shared/text.ts'

const NEGATION = '!'

// Stryker's `mutate` patterns: globs to mutate, minus the ones starting with "!".
export function mutationTargets(files: readonly string[], patterns: readonly string[]): string[] {
  const included = patterns.filter((pattern) => !pattern.startsWith(NEGATION))
  const excluded = patterns
    .filter((pattern) => pattern.startsWith(NEGATION))
    .map((pattern) => pattern.slice(NEGATION.length))
  return files
    .filter((file) => included.some((pattern) => matchesGlob(file, pattern)))
    .filter((file) => !excluded.some((pattern) => matchesGlob(file, pattern)))
    .toSorted(compareText)
}

export async function loadMutatePatterns(configUrl: URL): Promise<readonly string[]> {
  // eslint-disable-next-line no-unsanitized/method -- the URL is this repository's Stryker config
  const configModule: unknown = await import(configUrl.href)
  const config = parseObject(parseObject(configModule).get('default'))
  const patterns = field(config, 'mutate', ARRAY)
  if (!patterns.every((pattern) => typeof pattern === 'string')) {
    throw new TypeError(`expected "mutate" in ${configUrl.pathname} to list glob patterns`)
  }
  return patterns
}
