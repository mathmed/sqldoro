import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { commitFiles, createRepository, git } from '../../test/support/git.ts'
import { main } from './cli.ts'

const BASE_MANIFEST = JSON.stringify({
  contributes: {
    commands: [{ command: 'sqldoro.connect' }, { command: 'sqldoro.refresh' }],
    configuration: { properties: { 'sqldoro.rows': { type: 'integer' } } },
  },
})

function printed(spy: MockInstance<typeof console.log>): string {
  return spy.mock.calls.map(([text]) => String(text)).join('\n')
}

describe('contract command line', () => {
  let root = ''
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  beforeEach(async () => {
    root = await createRepository()
    await commitFiles(root, new Map([['package.json', BASE_MANIFEST]]), 'base')
    await git(root, 'switch', '--quiet', '--create', 'feature')
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function changeManifest(change: (manifest: unknown) => unknown): Promise<void> {
    const path = join(root, 'package.json')
    const manifest: unknown = JSON.parse(await readFile(path, 'utf8'))
    await writeFile(path, JSON.stringify(change(manifest)))
  }

  it('should pass when the contract only grows', async () => {
    await changeManifest(() =>
      JSON.parse(
        BASE_MANIFEST.replace('"sqldoro.refresh"}', '"sqldoro.refresh"},{"command":"sqldoro.new"}'),
      ),
    )

    expect(await main(['check', '--base', 'main'], { root })).toBe(0)
    expect(printed(log)).toBe(
      [
        'Added: command `sqldoro.new` added',
        'Contract: 0 breaking changes, 1 addition against main.',
      ].join('\n'),
    )
  })

  it('should fail on a removed command, against the merge base with the base branch', async () => {
    await git(root, 'switch', '--quiet', 'main')
    await commitFiles(root, new Map([['other.txt', 'main moved on\n']]), 'main moves')
    await git(root, 'switch', '--quiet', 'feature')
    await changeManifest(() =>
      JSON.parse(BASE_MANIFEST.replace(',{"command":"sqldoro.refresh"}', '')),
    )

    expect(await main(['check', '--base', 'main'], { root })).toBe(1)
    expect(printed(log)).toBe(
      [
        'Breaking: command `sqldoro.refresh` removed',
        'Contract: 1 breaking change, 0 additions against main.',
      ].join('\n'),
    )
  })

  it('should compare with origin/main by default', async () => {
    await expect(main(['check'], { root })).rejects.toThrow('origin/main')
  })

  it.each([[[]], [['diff']]])('should explain the usage for %j', async (argv) => {
    expect(await main(argv, { root })).toBe(2)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('usage:'))
  })
})
