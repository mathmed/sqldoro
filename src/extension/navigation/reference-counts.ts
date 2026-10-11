import type * as vscode from 'vscode'

import type { CellValue, Row } from '../../core/engine/query.ts'
import { referenceKey } from '../../core/navigation/links.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { tableCountQuery } from '../../core/results/table-query.ts'
import { type ReadOutcome, readThroughGuards } from '../editor/guarded-read.ts'
import type { ApprovedRead } from '../editor/run-job.ts'
import type { RunTarget } from '../editor/run-types.ts'
import { parameterTypesOf } from '../metadata/parameter-types.ts'
import type { TableContext } from '../tables/table-context.ts'

// How many rows of each referencing table reference a row of a tab, as decimal text, counted on
// the server through the guards, in one run; null where a count failed or the row holds no value
// to count by. Undefined when nothing ran.
export async function countReferences(
  context: TableContext,
  source: vscode.Uri,
  { tab, row }: { readonly tab: ResultSet; readonly row: number },
): Promise<readonly (string | null)[] | undefined> {
  const values = tab.viewRow(row)
  if (values === undefined || tab.meta.references.length === 0) {
    return undefined
  }
  const counted: number[] = []
  const outcomes = await readThroughGuards(context.runner, source, async (target) => {
    const reads = await countReads(context, target, { tab, values })
    counted.push(...reads.map(({ index }) => index))
    return reads.map(({ read }) => read)
  })
  if (outcomes === undefined) {
    return undefined
  }
  // A reference whose key the row does not hold was not counted: it has no outcome.
  const byReference = new Map(counted.map((index, place) => [index, outcomes.at(place)]))
  return tab.meta.references.map((...[, index]) => countOf(context, byReference.get(index)))
}

interface Counting {
  readonly tab: ResultSet
  readonly values: Row
}

// One count per reference whose key the row holds, with the place of the reference.
async function countReads(
  context: TableContext,
  target: RunTarget,
  { tab, values }: Counting,
): Promise<{ readonly index: number; readonly read: ApprovedRead }[]> {
  const reads = await Promise.all(
    tab.meta.references.map(async (reference, index) => {
      const key = referenceKey(reference, values)
      if (key === undefined) {
        return []
      }
      const table = reference.reference.table
      const parameterTypes = await parameterTypesOf(context, target, table)
      const query = tableCountQuery({ table, key, parameterTypes }, target.engine.dialect)
      return [{ index, read: { ...query, maxRows: 1 } }]
    }),
  )
  return reads.flat()
}

function countOf(context: TableContext, outcome: ReadOutcome | undefined): string | null {
  if (outcome === undefined) {
    return null
  }
  if ('problem' in outcome) {
    context.log.warn(`Could not count the rows that reference a row: ${outcome.problem}`)
    return null
  }
  return textOf(outcome.result.rows.at(0)?.at(0))
}

// COUNT(*) comes as a number in MySQL and as the text of a BIGINT in PostgreSQL.
function textOf(value: CellValue | undefined): string | null {
  return value === undefined || value === null ? null : String(value)
}
