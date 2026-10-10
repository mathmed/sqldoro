import { describe, expect, it } from 'vitest'

import manifest from '../../package.json' with { type: 'json' }
import { manifestFiles } from './manifest-files.ts'

describe('manifestFiles', () => {
  it('should list the entry point, the icons and the walkthrough media, codicons aside', () => {
    expect(
      manifestFiles({
        main: './dist/extension.cjs',
        icon: 'media/icon.png',
        contributes: {
          viewsContainers: { activitybar: [{ id: 'a', icon: 'media/a.svg' }] },
          views: { a: [{ id: 'v', icon: 'media/a.svg' }, { id: 'w' }] },
          commands: [
            { command: 'c', icon: '$(add)' },
            { command: 'd', icon: { light: 'media/light.svg', dark: 'media/dark.svg' } },
          ],
          walkthroughs: [
            {
              steps: [
                { media: { markdown: 'media/walkthrough/one.md' } },
                { media: { image: { light: 'media/l.png', dark: 'media/d.png' }, altText: 'x' } },
                { media: { svg: 'media/walkthrough/two.svg', altText: 'y' } },
              ],
            },
          ],
        },
      }),
    ).toStrictEqual([
      'extension/dist/extension.cjs',
      'extension/media/icon.png',
      'extension/media/a.svg',
      'extension/media/light.svg',
      'extension/media/dark.svg',
      'extension/media/walkthrough/one.md',
      'extension/media/l.png',
      'extension/media/d.png',
      'extension/media/walkthrough/two.svg',
    ])
  })

  it('should list nothing of a manifest it cannot read', () => {
    expect(manifestFiles(undefined)).toStrictEqual([])
    expect(manifestFiles({ contributes: { views: [], walkthroughs: {} } })).toStrictEqual([])
  })

  it('should find every file sqldoro itself names', () => {
    expect(manifestFiles(manifest)).toContain('extension/media/icon.png')
  })
})
