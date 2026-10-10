import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { explainStatement, planLines } from './plan.ts'

describe('explainStatement', () => {
  it('should put the plan or the analyze prefix of the dialect before the statement', () => {
    expect(explainStatement('SELECT 1', MYSQL_DIALECT, false)).toBe('EXPLAIN FORMAT=TREE SELECT 1')
    expect(explainStatement('SELECT 1', POSTGRES_DIALECT, true)).toBe(
      'EXPLAIN (ANALYZE, BUFFERS) SELECT 1',
    )
  })
})

describe('planLines', () => {
  it('should read one line per row, and split cells that hold several lines', () => {
    expect(planLines({ rows: [['Seq Scan on t'], ['  Filter: (a > 1)']] })).toStrictEqual([
      'Seq Scan on t',
      '  Filter: (a > 1)',
    ])
    expect(planLines({ rows: [['-> Limit\n    -> Table scan\r\n']] })).toStrictEqual([
      '-> Limit',
      '    -> Table scan',
      '',
    ])
  })

  it('should join the cells of a row and show NULL', () => {
    expect(planLines({ rows: [['a', null, 1]] })).toStrictEqual(['a NULL 1'])
  })
})
