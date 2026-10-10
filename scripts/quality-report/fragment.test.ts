import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Analysis } from './analysis.ts'
import {
  type Fragment,
  hasPassed,
  loadFragments,
  parseFragment,
  writeFragment,
} from './fragment.ts'

const LINT: Fragment = { analysis: Analysis.Eslint, exitCode: 1, output: 'problems', seconds: 2.5 }

describe('hasPassed', () => {
  it('should pass only on exit code 0', () => {
    expect(hasPassed({ ...LINT, exitCode: 0 })).toBe(true)
    expect(hasPassed(LINT)).toBe(false)
  })
})

describe('parseFragment', () => {
  it('should read what was written', () => {
    expect(parseFragment(JSON.stringify(LINT))).toEqual(LINT)
  })

  it('should reject an unknown analysis', () => {
    const text = JSON.stringify({ ...LINT, analysis: 'ruff' })

    expect(() => parseFragment(text)).toThrow(new TypeError('unknown analysis "ruff"'))
  })
})

describe('fragments folder', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sqldoro-fragments-'))
  })

  it('should store each fragment under its analysis name', async () => {
    await writeFragment(directory, LINT)

    expect(parseFragment(await readFile(join(directory, 'eslint.json'), 'utf8'))).toEqual(LINT)
  })

  it('should load every valid fragment and skip invalid files', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const tests: Fragment = { analysis: Analysis.Vitest, exitCode: 0, output: '', seconds: 1 }
    await writeFragment(directory, LINT)
    await writeFragment(directory, tests)
    await writeFile(join(directory, 'broken.json'), '{not json')
    await writeFile(join(directory, 'unknown.json'), JSON.stringify({ ...LINT, analysis: 'ruff' }))
    await writeFile(join(directory, 'notes.txt'), 'ignored')

    const fragments = await loadFragments(directory)

    expect([...fragments]).toEqual([
      [Analysis.Eslint, LINT],
      [Analysis.Vitest, tests],
    ])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('should load nothing when no job uploaded fragments', async () => {
    expect((await loadFragments(join(directory, 'missing'))).size).toBe(0)
  })

  it('should not hide a fragment that cannot be read', async () => {
    await writeFile(join(directory, 'eslint.json'), JSON.stringify(LINT))
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new RangeError('out of memory')
    })

    await expect(loadFragments(directory)).rejects.toThrow(RangeError)
  })
})
