import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { zipArchive, type ZipFile } from '../../test/support/zip.ts'
import { main, type PackageContext } from './cli.ts'
import { VSIX_FILES } from './vsix-rules.ts'

const MANIFEST = { name: 'sqldoro', version: '1.2.3', main: './dist/extension.cjs' }

function vsixFiles(overrides: readonly ZipFile[] = []): ZipFile[] {
  const names = new Set(overrides.map((file) => file.name))
  return [
    ...VSIX_FILES.filter((name) => !names.has(name)).map((name) => ({
      name,
      content: name === 'extension/package.json' ? JSON.stringify(MANIFEST) : name,
    })),
    ...overrides,
  ]
}

describe('package command line', () => {
  let root = ''
  let log: MockInstance<typeof console.log>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sqldoro-package-'))
    await writeFile(join(root, 'package.json'), JSON.stringify(MANIFEST))
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function context(
    files: readonly ZipFile[],
    environment: NodeJS.ProcessEnv = {},
  ): PackageContext & {
    readonly pack: ReturnType<typeof vi.fn>
  } {
    return {
      pack: vi.fn(async (packagePath: string) => {
        await writeFile(packagePath, zipArchive(files))
      }),
      lastCommitTime: async () => Promise.resolve(1_760_000_000),
      environment,
      root,
    }
  }

  function printed(): string {
    return log.mock.calls.map(([line]) => String(line)).join('\n')
  }

  it('should pack <name>-<version>.vsix dated at the last commit and report what it holds', async () => {
    const sut = context(vsixFiles())

    await expect(main(sut)).resolves.toBe(0)

    expect(sut.pack).toHaveBeenCalledWith(join(root, 'sqldoro-1.2.3.vsix'), '1760000000')
    expect(printed()).toMatch(
      /^>> package sqldoro-1\.2\.3\.vsix: [\d.]+kb, 22 files, sha256 [0-9a-f]{64}\n>> package file \[Content_Types\]\.xml 19b\n/u,
    )
    expect(printed()).toContain(
      `>> package file extension/package.json ${String(JSON.stringify(MANIFEST).length)}b`,
    )
  })

  it('should keep the date SOURCE_DATE_EPOCH gives', async () => {
    const sut = context(vsixFiles(), { SOURCE_DATE_EPOCH: '42' })

    await main(sut)

    expect(sut.pack).toHaveBeenCalledWith(join(root, 'sqldoro-1.2.3.vsix'), '42')
  })

  it('should fail and say why when the package holds what it should not', async () => {
    const sut = context(vsixFiles([{ name: 'extension/src/core/greeting.ts', content: 'x' }]))

    await expect(main(sut)).resolves.toBe(1)

    expect(printed()).toContain(
      '>> package problem: the package should not hold extension/src/core/greeting.ts',
    )
  })

  it('should fail when the package holds no manifest', async () => {
    const files = vsixFiles().filter((file) => file.name !== 'extension/package.json')

    await expect(main(context(files))).resolves.toBe(1)

    expect(printed()).toContain('>> package problem: the package misses extension/package.json')
  })
})
