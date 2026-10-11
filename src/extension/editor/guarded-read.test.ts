import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { type QueryHarness, queryHarness, sqlEditor } from '../../../test/support/query.ts'
import { resetVscode } from '../../../test/vscode.ts'
import { ColumnKind } from '../../core/engine/query.ts'
import { readThroughGuards } from './guarded-read.ts'

const COUNT = { name: 'count', dataType: 'INT8', kind: ColumnKind.Number }

let harness: QueryHarness
let uri: vscode.Uri

beforeEach(async () => {
  resetVscode()
  harness = queryHarness()
  harness.engine.answer = (request) =>
    request.sql.startsWith('SELECT') ? { columns: [COUNT], rows: [['3']] } : {}
  const editor = await sqlEditor(harness, 'SELECT 1')
  uri = editor.document.uri as unknown as vscode.Uri
})

describe('readThroughGuards', () => {
  it('should run reads on the session of the source and bring their rows back', async () => {
    const sut = await readThroughGuards(harness.runner, uri, async () =>
      Promise.resolve([{ sql: 'SELECT COUNT(*) FROM t WHERE a = $1', values: [7], maxRows: 1 }]),
    )

    expect(sut).toStrictEqual([
      { result: { columns: [COUNT], rows: [['3']], isTruncated: false, affectedRows: undefined } },
    ])
    expect(harness.engine.requests.at(-1)).toMatchObject({ values: [7], maxRows: 1 })
    expect(harness.records).toStrictEqual([])
  })

  it('should never run a statement that is not a read this way', async () => {
    const sut = await readThroughGuards(harness.runner, uri, async () =>
      Promise.resolve([{ sql: 'DELETE FROM t WHERE a = 1', values: [], maxRows: 1 }]),
    )

    expect(sut).toStrictEqual([
      { problem: 'sqldoro only reads rows this way: the statement was not run' },
    ])
    expect(harness.engine.requests).toStrictEqual([])
  })

  it('should give nothing when there is nothing to read', async () => {
    const sut = await readThroughGuards(harness.runner, uri, async () => Promise.resolve(undefined))

    expect(sut).toBeUndefined()
  })
})
