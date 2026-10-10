import { describe, expect, it } from 'vitest'

import { POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { planRun, RunScope } from './run-plan.ts'

const TEXT = 'SELECT 1;\nSELECT 2;\n\nSELECT 3'

function source(
  cursor: number,
  selectionStart = cursor,
  selectionEnd = cursor,
): Parameters<typeof planRun>[0] {
  return { text: TEXT, selectionStart, selectionEnd, cursor }
}

describe('planRun', () => {
  it('should run the statement under the cursor', () => {
    expect(planRun(source(12), RunScope.Current, POSTGRES_LEXICAL)).toStrictEqual([
      { sql: 'SELECT 2', offset: 10 },
    ])
  })

  it('should run nothing when no statement is under the cursor', () => {
    const text = 'SELECT 1;\n\n\nSELECT 2'

    expect(
      planRun(
        { text, selectionStart: 11, selectionEnd: 11, cursor: 11 },
        RunScope.Current,
        POSTGRES_LEXICAL,
      ),
    ).toStrictEqual([])
  })

  it('should run every statement of the selection, placed in the document', () => {
    expect(planRun(source(0, 3, TEXT.length), RunScope.Current, POSTGRES_LEXICAL)).toStrictEqual([
      { sql: 'ECT 1', offset: 3 },
      { sql: 'SELECT 2', offset: 10 },
      { sql: 'SELECT 3', offset: 21 },
    ])
  })

  it('should run the whole script', () => {
    expect(planRun(source(0, 0, 4), RunScope.All, POSTGRES_LEXICAL)).toStrictEqual([
      { sql: 'SELECT 1', offset: 0 },
      { sql: 'SELECT 2', offset: 10 },
      { sql: 'SELECT 3', offset: 21 },
    ])
  })
})
