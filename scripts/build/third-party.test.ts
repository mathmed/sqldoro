import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeText } from '../shared/files.ts'
import {
  declaredLicense,
  isAllowedLicense,
  packageFolder,
  packageFolders,
  thirdPartyNotices,
} from './third-party.ts'

describe('packageFolder', () => {
  it('should find the package of a module, scoped or nested, relative to the root or not', () => {
    expect(packageFolder('node_modules/pg/lib/client.js', '/repo')).toBe('/repo/node_modules/pg')
    expect(packageFolder('/repo/node_modules/@tanstack/table-core/build/index.js', '/x')).toBe(
      '/repo/node_modules/@tanstack/table-core',
    )
    expect(packageFolder('node_modules/a/node_modules/b/index.js', '/repo')).toBe(
      '/repo/node_modules/a/node_modules/b',
    )
    expect(packageFolder('C:\\repo\\node_modules\\pg\\index.js', '/x')).toBe(
      '/x/C:/repo/node_modules/pg',
    )
  })

  it('should find no package for the project itself or the virtual modules of the bundler', () => {
    expect(packageFolder('src/extension/extension.ts', '/repo')).toBeUndefined()
    expect(packageFolder('\0vite/modulepreload-polyfill.js', '/repo')).toBeUndefined()
  })

  it('should list each package once', () => {
    expect(
      packageFolders(['node_modules/pg/a.js', 'node_modules/pg/b.js', 'src/x.ts'], '/repo'),
    ).toStrictEqual(['/repo/node_modules/pg'])
  })
})

describe('declaredLicense', () => {
  it('should read the license in every form npm manifests use', () => {
    expect(declaredLicense(new Map([['license', 'MIT']]))).toBe('MIT')
    expect(declaredLicense(new Map([['license', { type: 'ISC' }]]))).toBe('ISC')
    expect(declaredLicense(new Map([['licenses', [{ type: 'MIT', url: 'x' }]]]))).toBe('MIT')
    expect(declaredLicense(new Map([['license', { url: 'x' }]]))).toBe('')
    expect(declaredLicense(new Map())).toBe('')
  })
})

describe('isAllowedLicense', () => {
  it('should allow the permissive licenses and an OR with one of them', () => {
    expect(isAllowedLicense('MIT')).toBe(true)
    expect(isAllowedLicense('Apache-2.0')).toBe(true)
    expect(isAllowedLicense('(MIT OR GPL-3.0-only)')).toBe(true)
    expect(isAllowedLicense('MIT AND ISC')).toBe(true)
  })

  it('should refuse copyleft licenses, an AND with one, or no license at all', () => {
    expect(isAllowedLicense('GPL-3.0-only')).toBe(false)
    expect(isAllowedLicense('(MIT AND GPL-3.0-only)')).toBe(false)
    expect(isAllowedLicense('')).toBe(false)
    expect(isAllowedLicense('SEE LICENSE IN LICENSE.txt')).toBe(false)
  })
})

describe('thirdPartyNotices', () => {
  let root = ''

  async function bundled(
    name: string,
    manifest: object,
    files: Record<string, string> = {},
  ): Promise<void> {
    const folder = join(root, 'node_modules', name)
    await writeText(
      join(folder, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', ...manifest }),
    )
    for (const [file, text] of Object.entries(files)) {
      await writeText(join(folder, file), text)
    }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sqldoro-notices-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('should gather the license and notice of every bundled package, sorted by name', async () => {
    await bundled('zed', { license: 'MIT' }, { LICENSE: 'MIT License\nCopyright Zed' })
    await bundled(
      '@scope/long',
      { license: 'Apache-2.0' },
      { 'LICENSE.txt': 'Apache', NOTICE: 'Notice of long' },
    )
    await bundled('bare', { license: 'ISC', homepage: 'https://example.com/bare' })

    const sut = await thirdPartyNotices(
      [
        'node_modules/zed/index.js',
        'node_modules/@scope/long/index.js',
        'node_modules/bare/x.js',
        'src/a.ts',
      ],
      root,
    )

    expect(sut.problems).toStrictEqual([])
    expect(sut.packageCount).toBe(3)
    expect(sut.text).toBe(
      [
        'sqldoro bundles the following libraries into the extension. Their licenses and notices follow.',
        '',
        '-'.repeat(80),
        '@scope/long 1.0.0 (Apache-2.0)',
        '',
        'Apache',
        '',
        'Notice of long',
        '',
        '-'.repeat(80),
        'bare 1.0.0 (ISC)',
        '',
        'The package ships no license file: it declares the ISC license, see https://example.com/bare.',
        '',
        '-'.repeat(80),
        'zed 1.0.0 (MIT)',
        '',
        'MIT License\nCopyright Zed',
        '',
        '',
      ].join('\n'),
    )
  })

  it('should refuse a bundled package whose license sqldoro cannot ship', async () => {
    await bundled('copyleft', { license: 'GPL-3.0-only' })
    await bundled('unnamed', { name: 7, version: 1 })

    const sut = await thirdPartyNotices(
      ['node_modules/copyleft/a.js', 'node_modules/unnamed/a.js'],
      root,
    )

    expect(sut.problems).toStrictEqual([
      expect.stringContaining(
        'copyleft@1.0.0 is bundled but its license, "GPL-3.0-only", is not one sqldoro can ship',
      ),
      expect.stringContaining('@ is bundled but its license, "", is not one'),
    ])
    expect(sut.text).toContain('it declares the  license.')
  })
})
