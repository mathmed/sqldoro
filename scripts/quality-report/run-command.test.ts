import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Analysis } from './analysis.ts'
import { parseFragment } from './fragment.ts'
import { runCommand } from './run-command.ts'

const NODE = process.execPath

describe('runCommand', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sqldoro-run-'))
  })

  async function storedFragment(name: string): Promise<ReturnType<typeof parseFragment>> {
    return parseFragment(await readFile(join(directory, name), 'utf8'))
  }

  it('should stream the output, keep the exit code and store the fragment', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const script = 'console.log("out"); console.error("err"); process.exitCode = 3'

    const exitCode = await runCommand(Analysis.Tsc, [NODE, '-e', script], directory)

    const fragment = await storedFragment('tsc.json')
    expect(exitCode).toBe(3)
    expect(fragment.exitCode).toBe(3)
    expect(fragment.output).toContain('out\n')
    expect(fragment.output).toContain('err\n')
    expect(fragment.seconds).toBeGreaterThan(0)
    expect(write).toHaveBeenCalledWith('out\n')
  })

  it('should strip the checkout path from the output', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const script = 'console.log(process.cwd() + "/src/core/greeting.ts")'

    await runCommand(Analysis.Eslint, [NODE, '-e', script], directory)

    expect((await storedFragment('eslint.json')).output).toBe('src/core/greeting.ts\n')
  })

  it('should fail with 127 when the command does not exist', async () => {
    const exitCode = await runCommand(Analysis.Knip, ['no-such-binary-xyz'], directory)

    const fragment = await storedFragment('knip.json')
    expect(exitCode).toBe(127)
    expect(fragment.output).toContain('could not run no-such-binary-xyz')
  })

  it('should fail when the command is killed by a signal', async () => {
    const script = 'process.kill(process.pid, "SIGTERM")'

    expect(await runCommand(Analysis.Smoke, [NODE, '-e', script], directory)).toBe(1)
  })
})
