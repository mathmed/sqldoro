import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeHygiene } from './hygiene.ts'

function hygiene(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Hygiene, exitCode, output, seconds: 1 }
}

describe('analyzeHygiene', () => {
  it('should be ok when no file has a problem', () => {
    const output = '> sqldoro@0.1.5 hygiene\nFile hygiene: 612 files checked, no problem.'

    expect(analyzeHygiene(hygiene(output, 0))).toStrictEqual({
      status: Status.Ok,
      summary: '612 files checked, no problem',
    })
  })

  it('should list the problems, each with its file', () => {
    const output = [
      'notes.txt: no newline at the end of the file',
      'src/a.ts:1: trailing whitespace',
      'big.zip: 2mb added, above the 500kb limit',
      'File hygiene: 612 files checked, 3 problems (`make format` fixes the whitespace).',
    ].join('\n')

    expect(analyzeHygiene(hygiene(output, 1))).toStrictEqual({
      status: Status.Failed,
      summary: '612 files checked, 3 problems',
      details: {
        title: 'Problems',
        body: [
          'notes.txt: no newline at the end of the file',
          'src/a.ts:1: trailing whitespace',
          'big.zip: 2mb added, above the 500kb limit',
        ].join('\n'),
        format: 'text',
      },
    })
  })

  it('should show the output when the check stops before its verdict', () => {
    const sut = analyzeHygiene(hygiene('fatal: not a git repository', 128))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('the hygiene check failed')
    expect(sut.details?.body).toBe('fatal: not a git repository')
  })
})
