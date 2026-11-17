import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeJscpd } from './jscpd.ts'

const TOTALS = `┌────────────┬────────────────┬─────────────┐
│ Format     │ Files analyzed │ Total lines │
├────────────┼────────────────┼─────────────┤
│ Total:     │ 451            │ 44039       │
└────────────┴────────────────┴─────────────┘`

const CLONES = `Clone found (typescript)
 - src/drivers/mysql/mysql-catalog.ts [172:42 - 186:38] (15 lines, 100 tokens)
   src/drivers/postgres/postgres-catalog.ts [199:38 - 213:38]
Clone found (typescript)
 - src/a.ts [1:1 - 6:2] (6 lines, 63 tokens)
   src/b.ts [10:4 - 15:2]
${TOTALS}
Found 2 clones.
ERROR: jscpd found too many duplicates (0.1%) over threshold (0.0%)`

function jscpd(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Jscpd, exitCode, output, seconds: 1 }
}

function clones(count: number): string {
  return [...Array.from({ length: count }).keys()]
    .map(
      (index) =>
        ` - src/a${String(index)}.ts [1:1 - 5:2] (5 lines, 50 tokens)\n   src/b.ts [1:1 - 5:2]`,
    )
    .join('\n')
}

describe('analyzeJscpd', () => {
  it('should be ok without clones, with the number of files it read', () => {
    expect(
      analyzeJscpd(jscpd(`No duplicates found.\n${TOTALS}\nFound 0 clones.`, 0)),
    ).toStrictEqual({ status: Status.Ok, summary: 'No duplicated code in 451 files' })
  })

  it('should still be ok when the totals are missing', () => {
    expect(analyzeJscpd(jscpd('Found 0 clones.', 0)).summary).toBe(
      'No duplicated code in the analyzed files',
    )
  })

  it('should list each clone with both places, its lines and its tokens', () => {
    const sut = analyzeJscpd(jscpd(CLONES, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('2 clones (21 duplicated lines)')
    expect(sut.details?.body).toBe(
      [
        '- `src/drivers/mysql/mysql-catalog.ts:172-186` ↔ `src/drivers/postgres/postgres-catalog.ts:199-213` (15 lines, 100 tokens)',
        '- `src/a.ts:1-6` ↔ `src/b.ts:10-15` (6 lines, 63 tokens)',
      ].join('\n'),
    )
  })

  it('should fail on a clone even if jscpd exits with success', () => {
    expect(analyzeJscpd(jscpd(clones(1), 0)).summary).toBe('1 clone (5 duplicated lines)')
  })

  it('should list fifty clones and say how many more there are', () => {
    const body = analyzeJscpd(jscpd(clones(52), 1)).details?.body ?? ''

    expect(body.split('\n')).toHaveLength(52)
    expect(body).toContain('... and 2 more: run `make duplication`.')
  })

  it('should show the output when jscpd fails without a clone', () => {
    const sut = analyzeJscpd(jscpd('Error: cannot read .jscpd.json', 2))

    expect(sut).toStrictEqual({
      status: Status.Failed,
      summary: 'jscpd failed',
      details: { title: 'Output', body: 'Error: cannot read .jscpd.json', format: 'text' },
    })
  })
})
