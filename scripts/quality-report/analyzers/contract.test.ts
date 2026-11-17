import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeContract } from './contract.ts'

function contract(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Contract, exitCode, output, seconds: 1 }
}

describe('analyzeContract', () => {
  it('should be ok without a change', () => {
    const output = 'Contract: 0 breaking changes, 0 additions against origin/main.'

    expect(analyzeContract(contract(output, 0))).toStrictEqual({
      status: Status.Ok,
      summary: '0 breaking changes, 0 additions against origin/main',
    })
  })

  it('should list the additions of a contract that only grows', () => {
    const output = [
      'Added: command `sqldoro.new` added',
      'Contract: 0 breaking changes, 1 addition against origin/main.',
    ].join('\n')

    expect(analyzeContract(contract(output, 0)).details?.body).toBe(
      '- Added: command `sqldoro.new` added',
    )
  })

  it('should fail on a breaking change and list every change', () => {
    const output = [
      'Breaking: setting `sqldoro.rows` type integer → string',
      'Added: view `sqldoro.new` added',
      'Contract: 1 breaking change, 1 addition against origin/main.',
    ].join('\n')

    expect(analyzeContract(contract(output, 1))).toStrictEqual({
      status: Status.Failed,
      summary: '1 breaking change, 1 addition against origin/main',
      details: {
        title: 'Contract changes',
        body: [
          '- Breaking: setting `sqldoro.rows` type integer → string',
          '- Added: view `sqldoro.new` added',
        ].join('\n'),
        format: 'markdown',
      },
    })
  })

  it('should show the output when the check stops before its verdict', () => {
    const sut = analyzeContract(contract('fatal: Not a valid object name origin/main', 128))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('the contract check failed')
  })
})
