import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { readText, writeText } from '../shared/files.ts'
import { main } from './cli.ts'

describe('release command line', () => {
  let root = ''
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sqldoro-release-'))
    await writeText(
      join(root, 'package.json'),
      JSON.stringify({ name: 'sqldoro', version: '0.1.0' }),
    )
    await writeText(
      join(root, 'CHANGELOG.md'),
      '# Changelog\n\n## [0.1.0] - 2026-10-10\n\n- The first version.\n',
    )
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('should write the notes and give the version to the next steps', async () => {
    const output = join(root, 'output')
    const notes = join(root, 'notes.md')

    const exitCode = await main(['check', '--tag', 'v0.1.0', '--notes', notes], {
      root,
      environment: { GITHUB_OUTPUT: output },
    })

    expect(exitCode).toBe(0)
    expect(log).toHaveBeenCalledWith('Releasing sqldoro 0.1.0')
    expect(await readText(notes)).toBe('- The first version.\n')
    expect(await readText(output)).toBe('version=0.1.0\n')
  })

  it('should only check, without notes or GitHub Actions', async () => {
    await expect(
      main(['check', '--tag', 'v0.1.0'], { root, environment: { GITHUB_OUTPUT: '' } }),
    ).resolves.toBe(0)
    await expect(main(['check', '--tag', 'v0.1.0'], { root, environment: {} })).resolves.toBe(0)
  })

  it('should fail and list the problems of a tag that cannot be released', async () => {
    const exitCode = await main(['check', '--tag', 'v0.2.0'], { root, environment: {} })

    expect(exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith(
      '✘ the tag is v0.2.0 but package.json holds version 0.1.0\n✘ CHANGELOG.md has no "## [0.2.0] - YYYY-MM-DD" section',
    )
  })

  it('should refuse an unknown command', async () => {
    await expect(main(['publish'], { root, environment: {} })).resolves.toBe(2)
    expect(error).toHaveBeenCalledWith(
      'unknown command "publish"\nusage: release check --tag <vX.Y.Z> [--notes <file>]',
    )
  })
})
