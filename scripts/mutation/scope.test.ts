import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadMutatePatterns, mutationTargets } from './scope.ts'

const STRYKER_CONFIG = new URL('../../stryker.config.mjs', import.meta.url)

async function configWith(source: string): Promise<URL> {
  const directory = await mkdtemp(join(tmpdir(), 'sqldoro-stryker-'))
  const path = join(directory, 'stryker.config.mjs')
  await writeFile(path, source)
  return pathToFileURL(path)
}

describe('mutationTargets', () => {
  const patterns = ['src/core/**/*.ts', '!src/**/*.test.ts']

  it('should keep only the files in scope, sorted', () => {
    const files = [
      'src/core/safety/where-guard.ts',
      'README.md',
      'src/core/greeting.test.ts',
      'src/extension/extension.ts',
      'src/core/greeting.ts',
    ]

    expect(mutationTargets(files, patterns)).toEqual([
      'src/core/greeting.ts',
      'src/core/safety/where-guard.ts',
    ])
  })

  it('should find nothing to mutate when the diff misses the scope', () => {
    expect(mutationTargets(['README.md', 'src/drivers/mysql/driver.ts'], patterns)).toEqual([])
  })
})

describe('loadMutatePatterns', () => {
  it('should read the scope from the Stryker config of the repository', async () => {
    expect(await loadMutatePatterns(STRYKER_CONFIG)).toEqual([
      'src/core/**/*.ts',
      '!src/**/*.test.ts',
    ])
  })

  it('should reject a config whose scope is not a list of globs', async () => {
    const config = await configWith('export default { mutate: ["src/**", 42] }')

    await expect(loadMutatePatterns(config)).rejects.toThrow('to list glob patterns')
  })

  it('should reject a config without a scope', async () => {
    const config = await configWith('export default { testRunner: "command" }')

    await expect(loadMutatePatterns(config)).rejects.toThrow('expected "mutate" to be an array')
  })
})
