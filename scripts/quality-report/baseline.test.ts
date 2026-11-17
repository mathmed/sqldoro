import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { Analysis } from './analysis.ts'
import { baselineNote, loadBaseline } from './baseline.ts'
import { writeFragment } from './fragment.ts'

const TSC = { analysis: Analysis.Tsc, exitCode: 0, output: '', seconds: 1 }

describe('loadBaseline', () => {
  it('should read the fragments of the base run', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sqldoro-base-'))
    await writeFragment(directory, TSC)

    const sut = await loadBaseline({ directory, name: 'main', runUrl: 'https://run' })

    expect(sut).toStrictEqual({
      name: 'main',
      fragments: new Map([[Analysis.Tsc, TSC]]),
      runUrl: 'https://run',
    })
  })

  it('should have no fragments without a directory, or with a missing one', async () => {
    const missing = join(tmpdir(), 'sqldoro-no-such-base')

    expect(
      (await loadBaseline({ directory: undefined, name: 'main', runUrl: '' })).fragments.size,
    ).toBe(0)
    expect(
      (await loadBaseline({ directory: missing, name: 'main', runUrl: '' })).fragments.size,
    ).toBe(0)
  })
})

describe('baselineNote', () => {
  const fragments = new Map([[Analysis.Tsc, TSC]])

  it('should say there is no baseline', () => {
    expect(baselineNote({ name: 'main', fragments: new Map(), runUrl: '' })).toBe(
      'no `main` baseline: deltas are n/a',
    )
  })

  it('should link the base run when it is known', () => {
    expect(baselineNote({ name: 'main', fragments, runUrl: 'https://run' })).toBe(
      'compared with the [last `main` run](https://run)',
    )
    expect(baselineNote({ name: 'develop', fragments, runUrl: '' })).toBe(
      'compared with the last `develop` run',
    )
  })
})
