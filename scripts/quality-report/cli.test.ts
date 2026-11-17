import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Analysis } from './analysis.ts'
import { main } from './cli.ts'
import { writeFragment } from './fragment.ts'
import { MARKER } from './render.ts'

const NODE = process.execPath
const NOW = new Date('2026-11-17T18:02:00.000Z')
const CONTEXT = { environment: {}, now: NOW }

describe('quality report command line', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sqldoro-cli-'))
  })

  it('should run an analysis and keep its exit code', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const exitCode = await main(
      ['run', 'tsc', '--dir', directory, '--', NODE, '-e', 'process.exitCode = 5'],
      CONTEXT,
    )

    expect(exitCode).toBe(5)
    expect(JSON.parse(await readFile(join(directory, 'tsc.json'), 'utf8'))).toMatchObject({
      analysis: 'tsc',
      exitCode: 5,
    })
  })

  it('should render the report to a file with the CI footer', async () => {
    await writeFragment(directory, {
      analysis: Analysis.Tsc,
      exitCode: 0,
      output: '',
      seconds: 1,
    })
    const output = join(directory, 'report.md')
    const needs = JSON.stringify({ lint: { result: 'cancelled' } })
    const environment = { GITHUB_REPOSITORY: 'mathmed/sqldoro', GITHUB_RUN_ID: '7' }

    const exitCode = await main(
      ['render', '--dir', directory, '--needs-json', needs, '--output', output],
      { environment, now: NOW },
    )

    const report = await readFile(output, 'utf8')
    expect(exitCode).toBe(0)
    expect(report.startsWith(MARKER)).toBe(true)
    expect(report).toContain('|  | Types (tsc) | ✅ | No type errors |')
    expect(report).toContain('Job `lint` was cancelled: analysis not run')
    expect(report).toContain(
      '2026-11-17 18:02 UTC · [CI run](https://github.com/mathmed/sqldoro/actions/runs/7) · no `main` baseline: deltas are n/a',
    )
  })

  it('should compare with the fragments of the base run it is given', async () => {
    const base = await mkdtemp(join(tmpdir(), 'sqldoro-cli-base-'))
    await writeFragment(directory, {
      analysis: Analysis.Tsc,
      exitCode: 2,
      output: 'a.ts: error TS1: x',
      seconds: 1,
    })
    await writeFragment(base, {
      analysis: Analysis.Tsc,
      exitCode: 2,
      output: 'b.ts: error TS1: y',
      seconds: 1,
    })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const environment = {
      GITHUB_REPOSITORY: 'mathmed/sqldoro',
      QUALITY_REPORT_BASE_RUN_ID: '6',
    }

    await main(['render', '--dir', directory, '--base-dir', base, '--base-name', 'develop'], {
      environment,
      now: NOW,
    })

    const report = String(write.mock.calls[0]?.[0])
    expect(report).toContain('1 type error · inherited from `develop`')
    expect(report).toContain(
      'compared with the [last `develop` run](https://github.com/mathmed/sqldoro/actions/runs/6)',
    )
  })

  it('should print the report when no output file is given', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    expect(await main(['render', '--dir', directory], CONTEXT)).toBe(0)
    expect(write).toHaveBeenCalledWith(expect.stringContaining(MARKER))
  })

  it.each([
    [[], 'unknown command "undefined"'],
    [['publish'], 'unknown command "publish"'],
    [['run', '--', NODE], 'unknown analysis "undefined"'],
    [['run', 'ruff', '--', 'ruff'], 'unknown analysis "ruff"'],
    [['run', 'tsc'], 'missing the command to run after --'],
    [['run', 'tsc', '--'], 'missing the command to run after --'],
  ])('should explain the usage for %j', async (argv, message) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(await main(argv, CONTEXT)).toBe(2)
    expect(error).toHaveBeenCalledWith(expect.stringContaining(message))
    expect(error).toHaveBeenCalledWith(expect.stringContaining('usage:'))
  })
})
