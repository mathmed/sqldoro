import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeBuild } from './build.ts'

const BUILT = `
> sqldoro@0.0.1 build
> node scripts/build.ts


  dist/extension.cjs      1.0kb
  dist/extension.cjs.map  1.9kb

⚡ Done in 2ms`

const BROKEN = `✘ [ERROR] Unexpected end of file

    src/core/probe.ts:2:0:
      2 │
        ╵ ^

1 error`

function build(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Build, exitCode, output, seconds: 1 }
}

describe('analyzeBuild', () => {
  it('should report the bundle size and the build time', () => {
    expect(analyzeBuild(build(BUILT, 0))).toStrictEqual({
      status: Status.Ok,
      summary: 'Bundled dist/extension.cjs 1.0kb in 2ms',
    })
  })

  it('should keep the mark esbuild puts after a large bundle', () => {
    // The bundle lines of the smoke job of #2.
    const output = `  dist/extension.cjs      1.5mb \u26A0\uFE0F\n  dist/extension.cjs.map  3.5mb\n\n\u26A1 Done in 122ms`

    expect(analyzeBuild(build(output, 0)).summary).toBe(
      'Bundled dist/extension.cjs 1.5mb \u26A0\uFE0F in 122ms',
    )
  })

  it('should not need esbuild details to be ok', () => {
    expect(analyzeBuild(build('', 0)).summary).toBe('Built')
  })

  it('should count the build errors', () => {
    const sut = analyzeBuild(build(BROKEN, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('1 build error')
    expect(sut.details?.body).toBe(BROKEN)
  })

  it('should fail without esbuild errors when the script itself fails', () => {
    expect(analyzeBuild(build('Error: Cannot find module esbuild', 1)).summary).toBe('Build failed')
  })
})
