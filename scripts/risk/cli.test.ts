import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { main, type RiskContext } from './cli.ts'

const FLOORS = [
  'floors:',
  '  - category: pipeline config',
  '    level: high',
  '    paths: [scripts/**, .github/**]',
].join('\n')

function printed(spy: MockInstance<typeof console.log>): string {
  return spy.mock.calls.map(([text]) => String(text)).join('\n')
}

describe('risk command line', () => {
  let root = ''
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sqldoro-risk-'))
    await writeFile(join(root, 'floors.yaml'), FLOORS)
    await writeFile(join(root, 'broken.yaml'), 'floors: 1')
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  // git is the external boundary of the script: this fake gives the files the branch touches.
  function context(
    files: readonly string[],
  ): RiskContext & { touchedFiles: ReturnType<typeof vi.fn> } {
    return { root, touchedFiles: vi.fn(async () => Promise.resolve(files)) }
  }

  it('should print the floor of the changes against the base', async () => {
    const sut = context(['scripts/risk.ts', 'README.md'])

    const exitCode = await main(
      ['floor', '--base', 'origin/develop', '--floors', 'floors.yaml'],
      sut,
    )

    expect(exitCode).toBe(0)
    expect(sut.touchedFiles).toHaveBeenCalledWith('origin/develop')
    expect(printed(log)).toBe('Risk floor: high\n- pipeline config (high): scripts/risk.ts')
  })

  it('should compare with origin/main and read .github/risk-floors.yaml by default', async () => {
    await mkdir(join(root, '.github'))
    await writeFile(join(root, '.github', 'risk-floors.yaml'), FLOORS)
    const sut = context(['.github/workflows/ci.yml'])

    expect(await main(['floor'], sut)).toBe(0)
    expect(sut.touchedFiles).toHaveBeenCalledWith('origin/main')
    expect(printed(log)).toContain('Risk floor: high')
  })

  it('should pass a PR whose risk label reaches the floor', async () => {
    const sut = context(['.github/workflows/ci.yml'])

    const exitCode = await main(
      ['check', '--floors', 'floors.yaml', '--labels-json', '["risk:high"]'],
      sut,
    )

    expect(exitCode).toBe(0)
    expect(printed(log)).toContain('Risk label is at or above the floor.')
  })

  it('should fail a PR whose risk label is below the floor', async () => {
    const sut = context(['scripts/risk.ts'])

    const exitCode = await main(
      ['check', '--floors', 'floors.yaml', '--labels-json', '["risk:low"]'],
      sut,
    )

    expect(exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith(
      'Risk label check failed: risk:low is below the floor of this PR (risk:high).',
    )
  })

  it('should never check labels when only asked for the floor', async () => {
    const sut = context(['scripts/risk.ts'])

    expect(await main(['floor', '--floors', 'floors.yaml', '--labels-json', '[]'], sut)).toBe(0)
  })

  it('should fail with a readable message on broken floors or labels', async () => {
    expect(await main(['floor', '--floors', 'broken.yaml'], context([]))).toBe(1)
    expect(
      await main(['check', '--floors', 'floors.yaml', '--labels-json', '{}'], context([])),
    ).toBe(1)
    expect(error.mock.calls).toEqual([
      ['Risk label check failed: the risk floors need a top-level `floors` list'],
      ['Risk label check failed: --labels-json must be a JSON list of strings, got: {}'],
    ])
  })

  it('should not hide a failure of git', async () => {
    const sut: RiskContext = {
      root,
      touchedFiles: async () => Promise.reject(new Error('fatal: bad revision')),
    }

    await expect(main(['floor', '--floors', 'floors.yaml'], sut)).rejects.toThrow('bad revision')
  })

  it.each([[['report']], [['check']], [[]]])('should explain the usage for %j', async (argv) => {
    expect(await main(argv, context([]))).toBe(2)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('usage:'))
  })
})
