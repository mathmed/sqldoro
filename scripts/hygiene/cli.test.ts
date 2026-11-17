import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { commitFiles, createRepository, git } from '../../test/support/git.ts'
import { main } from './cli.ts'
import { MAX_ADDED_FILE_BYTES } from './rules.ts'

const CLEAN = 'export const value = 1\n'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x20, 0x0a])

function printed(spy: MockInstance<typeof console.log>): string {
  return spy.mock.calls.map(([text]) => String(text)).join('\n')
}

describe('hygiene command line', () => {
  let root = ''
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  beforeEach(async () => {
    root = await createRepository()
    await mkdir(join(root, 'src'))
    await commitFiles(
      root,
      new Map([
        ['src/a.ts', CLEAN],
        ['README.md', '# readme\n'],
      ]),
      'base',
    )
    await writeFile(join(root, 'icon.png'), PNG)
    await symlink('README.md', join(root, 'AGENTS.md'))
    await commitFiles(root, new Map(), 'binary and link')
    await git(root, 'switch', '--quiet', '--create', 'feature')
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function read(file: string): Promise<string> {
    return readFile(join(root, file), 'utf8')
  }

  it('should pass on clean text, binary files, symbolic links and small added files', async () => {
    await writeFile(join(root, 'small.txt'), 'small\n')
    await git(root, 'add', 'small.txt')

    expect(await main(['check'], { root })).toBe(0)
    expect(printed(log)).toBe('File hygiene: 5 files checked, no problem.')
  })

  it('should list every problem of the text files, even untracked ones', async () => {
    await writeFile(join(root, 'src/a.ts'), 'export const value = 1 \n\n')
    await writeFile(join(root, 'notes.txt'), 'no newline')

    expect(await main(['check'], { root })).toBe(1)
    expect(printed(log)).toBe(
      [
        'notes.txt: no newline at the end of the file',
        'src/a.ts:1: trailing whitespace',
        'src/a.ts: blank lines at the end of the file',
        'File hygiene: 5 files checked, 3 problems (`make format` fixes the whitespace).',
      ].join('\n'),
    )
  })

  it('should refuse a large file the index adds, but not one already committed', async () => {
    await writeFile(join(root, 'big.txt'), `${'a'.repeat(MAX_ADDED_FILE_BYTES)}\n`)
    await git(root, 'add', 'big.txt')

    expect(await main(['check'], { root })).toBe(1)
    expect(printed(log)).toContain('big.txt: 500kb added, above the 500kb limit')

    await git(root, 'commit', '--quiet', '--message', 'big')
    expect(await main(['check'], { root })).toBe(0)
  })

  it('should refuse a large file the branch added since the base', async () => {
    await commitFiles(root, new Map([['big.txt', `${'a'.repeat(MAX_ADDED_FILE_BYTES)}\n`]]), 'big')

    expect(await main(['check', '--base', 'main'], { root })).toBe(1)
    expect(printed(log)).toContain('big.txt: 500kb added, above the 500kb limit')
  })

  it('should fix the whitespace and newlines of the files it is given, and only those', async () => {
    await writeFile(join(root, 'src/a.ts'), 'export const value = 1  \n\n\n')
    await writeFile(join(root, 'README.md'), '# readme')

    expect(await main(['fix', 'src/a.ts', 'icon.png', 'AGENTS.md'], { root })).toBe(0)
    expect(await read('src/a.ts')).toBe(CLEAN)
    expect(await read('README.md')).toBe('# readme')
    expect(printed(log)).toBe('fixed src/a.ts')
  })

  it('should fix every file git knows or would add without a list', async () => {
    await writeFile(join(root, 'README.md'), '# readme')
    await writeFile(join(root, 'notes.txt'), 'note \n')

    expect(await main(['fix'], { root })).toBe(0)
    expect(await read('README.md')).toBe('# readme\n')
    expect(await read('notes.txt')).toBe('note\n')
    expect(Buffer.from(await readFile(join(root, 'icon.png')))).toStrictEqual(Buffer.from(PNG))
  })

  it.each([[[]], [['lint']], [['check', 'a.ts']], [['fix', '--base', 'main']]])(
    'should explain the usage for %j',
    async (argv) => {
      expect(await main(argv, { root })).toBe(2)
      expect(error).toHaveBeenCalledWith(expect.stringContaining('usage:'))
    },
  )
})
