import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { commitFiles, createRepository } from '../../test/support/git.ts'
import { parseSuppressionsLine } from '../shared/suppressions-result.ts'
import { main } from './cli.ts'

const BASELINE = 'suppressions-baseline.json'
const DISABLED = '// eslint-disable-next-line no-console -- reason\nconsole.log(1)\n'
const CLEAN = 'export const value = 1\n'
const ONE_DISABLE = '{\n  "src/a.ts": {\n    "eslint-disable": 1\n  }\n}\n'

function printed(spy: MockInstance<typeof console.log>): string {
  return spy.mock.calls.map(([text]) => String(text)).join('\n')
}

describe('suppressions command line', () => {
  let root = ''
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  beforeEach(async () => {
    root = await createRepository()
    await mkdir(join(root, 'src'))
    await commitFiles(
      root,
      new Map([
        ['src/a.ts', DISABLED],
        ['src/b.ts', CLEAN],
        ['README.md', '<!-- eslint-disable -->'],
      ]),
      'base',
    )
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function baseline(): Promise<string> {
    return readFile(join(root, BASELINE), 'utf8')
  }

  it('should pass when the source files match the baseline', async () => {
    await writeFile(join(root, BASELINE), ONE_DISABLE)

    expect(await main(['check'], { root })).toBe(0)
    expect(printed(log)).toContain('Suppressions match the baseline.')
    expect(parseSuppressionsLine(printed(log))).toEqual({
      total: 1,
      baselineTotal: 1,
      totals: [{ kind: 'eslint-disable', count: 1 }],
      changes: [],
    })
  })

  it('should fail on a new suppression, also in a file git does not track yet', async () => {
    await writeFile(join(root, BASELINE), ONE_DISABLE)
    await writeFile(join(root, 'src/new.test.ts'), "it.skip('a', () => {})\n")

    expect(await main(['check'], { root })).toBe(1)
    expect(printed(log)).toContain('  src/new.test.ts: test-skip 0 -> 1 (lines: 1)')
    expect(printed(log)).not.toContain('match the baseline')
  })

  it('should fail when a suppression is gone until the baseline is lowered', async () => {
    await writeFile(join(root, BASELINE), ONE_DISABLE)
    await writeFile(join(root, 'src/a.ts'), CLEAN)

    expect(await main(['check'], { root })).toBe(1)
    expect(printed(log)).toContain('Suppressions removed')

    expect(await main(['update'], { root })).toBe(0)
    expect(await baseline()).toBe('{}\n')
    expect(await main(['check'], { root })).toBe(0)
  })

  it('should count every suppression as new when there is no baseline', async () => {
    expect(await main(['check'], { root })).toBe(1)
    expect(printed(log)).toContain('  src/a.ts: eslint-disable 0 -> 1 (lines: 1)')
  })

  it('should refuse to raise the baseline without --allow-increase', async () => {
    await writeFile(join(root, BASELINE), '{}\n')

    expect(await main(['update'], { root })).toBe(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Refusing to raise the baseline'))
    expect(await baseline()).toBe('{}\n')
  })

  it('should raise the baseline with --allow-increase', async () => {
    expect(await main(['update', '--allow-increase'], { root })).toBe(0)
    expect(await baseline()).toBe(ONE_DISABLE)
    expect(printed(log)).toContain(`Baseline written to ${join(root, BASELINE)}.`)
  })

  it('should read and write the baseline given by --baseline', async () => {
    await writeFile(join(root, 'other.json'), ONE_DISABLE)

    expect(await main(['check', '--baseline', 'other.json'], { root })).toBe(0)
  })

  it('should fail loudly on a baseline it cannot read', async () => {
    await writeFile(join(root, BASELINE), 'not json')

    await expect(main(['check'], { root })).rejects.toThrow(SyntaxError)
  })

  it('should explain the usage for an unknown command', async () => {
    expect(await main(['report'], { root })).toBe(2)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('usage:'))
  })
})
