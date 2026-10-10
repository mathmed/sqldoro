import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { type QueryHarness, queryHarness } from '../../../test/support/query.ts'
import { resetVscode, Uri, window } from '../../../test/vscode.ts'
import { ColumnKind } from '../../core/engine/query.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { refreshOf, refreshTab } from './refresh-rows.ts'

const NAME = { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text }

let harness: QueryHarness

function tab(): ResultSet {
  const sut = new ResultSet({
    id: 't',
    sql: 'SELECT name FROM t',
    kind: 'rows',
    canServerView: true,
    canRefresh: true,
  })
  sut.describe([NAME])
  sut.addRows([['b'], ['a']])
  sut.succeed({ durationMs: 1, affectedRows: null, isTruncated: false, autoLimit: null })
  return sut
}

beforeEach(() => {
  resetVscode()
  window.showInformationMessage.mockReset()
  harness = queryHarness()
})

describe('refreshTab', () => {
  it('should read nothing for a result whose editor closed, and say why', async () => {
    const closed = Uri.parse('untitled:Untitled-9') as unknown as vscode.Uri

    await refreshTab(harness.runner, closed, tab())

    expect(harness.engine.requests).toStrictEqual([])
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'The editor of this result is closed: run the query again.',
    )
  })
})

describe('refreshOf', () => {
  it('should read the query again, or its view on the server', () => {
    const sut = tab()
    expect(refreshOf(sut, POSTGRES_DIALECT)).toStrictEqual({
      sql: 'SELECT name FROM t',
      values: [],
      isServerView: false,
    })

    sut.restart({ sort: [{ column: 0, isDescending: false }], filters: [] })

    expect(refreshOf(sut, POSTGRES_DIALECT)).toStrictEqual({
      sql: 'SELECT * FROM (\nSELECT name FROM t\n) AS sqldoro_view\nORDER BY "name" ASC',
      values: [],
      isServerView: true,
    })
  })
})
