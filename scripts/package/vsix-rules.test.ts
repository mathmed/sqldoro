import { describe, expect, it } from 'vitest'

import { VSIX_BUDGET_BYTES, VSIX_FILES, vsixProblems } from './vsix-rules.ts'

const MANIFEST = { main: './dist/extension.cjs', icon: 'media/icon.png' }

describe('vsixProblems', () => {
  it('should find nothing wrong with the files it expects', () => {
    expect(
      vsixProblems({
        names: [...VSIX_FILES, 'extension/media/walkthrough/connect.md'],
        manifest: MANIFEST,
        bytes: VSIX_BUDGET_BYTES,
      }),
    ).toStrictEqual([])
  })

  it('should name the files it misses and those it should not hold', () => {
    const names = VSIX_FILES.filter((name) => name !== 'extension/dist/webview/results.js')

    expect(
      vsixProblems({
        names: [...names, 'extension/dist/extension.cjs.map', 'extension/node_modules/pg/index.js'],
        manifest: MANIFEST,
        bytes: 1,
      }),
    ).toStrictEqual([
      'the package misses extension/dist/webview/results.js',
      'the package should not hold extension/dist/extension.cjs.map',
      'the package should not hold extension/node_modules/pg/index.js',
    ])
  })

  it('should name a file the manifest needs that the package does not hold', () => {
    expect(
      vsixProblems({
        names: VSIX_FILES,
        manifest: {
          ...MANIFEST,
          contributes: {
            walkthroughs: [{ steps: [{ media: { markdown: 'media/walkthrough/gone.md' } }] }],
          },
        },
        bytes: 1,
      }),
    ).toStrictEqual([
      'package.json names extension/media/walkthrough/gone.md, which the package does not hold',
    ])
  })

  it('should refuse a package over its budget', () => {
    expect(
      vsixProblems({ names: VSIX_FILES, manifest: MANIFEST, bytes: VSIX_BUDGET_BYTES + 1 }),
    ).toStrictEqual(['the package weighs 1.5mb, over its budget of 1.5mb'])
  })
})
