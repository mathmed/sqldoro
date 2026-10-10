import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzePrettier } from './prettier.ts'

function prettier(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Prettier, exitCode, output, seconds: 1 }
}

describe('analyzePrettier', () => {
  it('should be ok when every file is formatted', () => {
    const output = 'Checking formatting...\nAll matched files use Prettier code style!'

    expect(analyzePrettier(prettier(output, 0))).toStrictEqual({
      status: Status.Ok,
      summary: 'Formatting is correct',
    })
  })

  it('should list the files that need formatting', () => {
    const output = [
      'Checking formatting...',
      '[warn] eslint.config.ts',
      '[warn] README.md',
      '[warn] Code style issues found in 2 files. Run Prettier with --write to fix.',
    ].join('\n')

    const sut = analyzePrettier(prettier(output, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('2 files need formatting (`make format`)')
    expect(sut.details?.body).toBe('eslint.config.ts\nREADME.md')
  })

  it('should use the singular for one file', () => {
    const output = '[warn] a.ts\n[warn] Code style issues found in the above file.'

    expect(analyzePrettier(prettier(output, 1)).summary).toBe(
      '1 file needs formatting (`make format`)',
    )
  })

  it('should show the output when Prettier itself fails', () => {
    const output = '[error] Invalid configuration'

    const sut = analyzePrettier(prettier(output, 2))

    expect(sut.summary).toBe('Prettier failed')
    expect(sut.details?.body).toBe(output)
  })
})
