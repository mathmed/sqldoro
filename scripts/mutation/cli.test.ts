import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { MutantResult } from '@stryker-mutator/api/core'
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { MUTATION_RESULT_PREFIX, parseResultLine } from '../shared/mutation-result.ts'
import { main, type MutationContext, type MutationRunner } from './cli.ts'

const PATTERNS = ['src/core/**/*.ts', '!src/**/*.test.ts']

function mutant(status: MutantResult['status']): MutantResult {
  return {
    id: status,
    fileName: 'src/core/greeting.ts',
    mutatorName: 'StringLiteral',
    replacement: '""',
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    status,
  }
}

// Stryker and git are the external boundary of the script: these fakes replace them.
function runner(changed: readonly string[], mutants: readonly MutantResult[]): MutationRunner {
  return {
    runMutationTest: vi.fn(async () => Promise.resolve(mutants)),
    changedFiles: vi.fn(async () => Promise.resolve(changed)),
    mutatePatterns: async () => Promise.resolve(PATTERNS),
  }
}

function printedResult(log: MockInstance<typeof console.log>): ReturnType<typeof parseResultLine> {
  const lines = log.mock.calls.map(([line]) => String(line))
  return parseResultLine(lines.find((line) => line.startsWith(MUTATION_RESULT_PREFIX)) ?? '')
}

describe('mutation command line', () => {
  let summaryFile = ''

  beforeEach(async () => {
    summaryFile = join(await mkdtemp(join(tmpdir(), 'sqldoro-mutation-')), 'summary.md')
  })

  function context(sut: MutationRunner, environment: NodeJS.ProcessEnv = {}): MutationContext {
    return {
      runner: sut,
      environment: { GITHUB_STEP_SUMMARY: summaryFile, ...environment },
      root: '',
    }
  }

  it('should mutate only the changed core files and pass at the default ratchet', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const sut = runner(
      ['README.md', 'src/core/greeting.ts', 'src/core/greeting.test.ts'],
      [mutant('Killed')],
    )

    const exitCode = await main(['changed', '--base', 'origin/develop'], context(sut))

    expect(exitCode).toBe(0)
    expect(sut.changedFiles).toHaveBeenCalledWith('origin/develop')
    expect(sut.runMutationTest).toHaveBeenCalledWith(['src/core/greeting.ts'])
    expect(printedResult(log)).toMatchObject({ isSkipped: false, score: 100, minScore: 95 })
    expect(await readFile(summaryFile, 'utf8')).toContain('**Score: 100.0%** (minimum 95%')
  })

  it('should compare with origin/main by default', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const sut = runner([], [])

    await main(['changed'], context(sut))

    expect(sut.changedFiles).toHaveBeenCalledWith('origin/main')
  })

  it('should skip Stryker when no core file changed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const sut = runner(['README.md', 'src/extension/extension.ts'], [])

    expect(await main(['changed'], context(sut))).toBe(0)
    expect(sut.runMutationTest).not.toHaveBeenCalled()
    expect(printedResult(log)).toMatchObject({
      isSkipped: true,
      reason: 'No core file changed: nothing to mutate.',
    })
  })

  it('should fail below the ratchet set by the repository variable', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const sut = runner([], [mutant('Killed'), mutant('Killed'), mutant('Survived')])

    const exitCode = await main(['full'], context(sut, { MUTATION_MIN_SCORE: '70' }))

    expect(exitCode).toBe(1)
    expect(sut.runMutationTest).toHaveBeenCalledWith(undefined)
    expect(printedResult(log)).toMatchObject({ minScore: 70, killed: 2, total: 3 })
  })

  it('should pass at a ratchet the score reaches', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const sut = runner([], [mutant('Killed'), mutant('Survived')])

    expect(await main(['full'], context(sut, { MUTATION_MIN_SCORE: '50' }))).toBe(0)
  })

  it('should only print the summary outside GitHub Actions', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const sut = runner([], [mutant('Killed')])

    await main(['full'], { runner: sut, environment: {}, root: '' })

    expect(log).toHaveBeenCalledWith(expect.stringContaining('## Mutation testing'))
  })

  it('should reject a ratchet that is not a number', async () => {
    await expect(
      main(['full'], context(runner([], []), { MUTATION_MIN_SCORE: 'high' })),
    ).rejects.toThrow('MUTATION_MIN_SCORE must be a number, got "high"')
  })

  it('should explain the usage for an unknown command', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(await main(['report'], context(runner([], [])))).toBe(2)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('usage:'))
  })
})
