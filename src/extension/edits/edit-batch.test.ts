import { describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { POSTGRES_ENGINE, SHOP } from '../../../test/support/query.ts'
import { ScriptedEngine } from '../../../test/support/sessions.ts'
import type { EditPlan } from '../../core/edits/plan.ts'
import { EditVerb } from '../../core/edits/statements.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'
import { ActiveRun } from '../editor/active-run.ts'
import type { RunParts } from '../editor/run-types.ts'
import { Approval } from '../safety/approval.ts'
import { EditorTransactions } from '../transactions/editor-transactions.ts'
import { runBatch } from './edit-batch.ts'

const UPDATE = 'UPDATE "sales"."orders" SET "note" = $1 WHERE "id" = $2'
const PLAN: EditPlan = {
  table: 'sales.orders',
  statements: [
    {
      verb: EditVerb.Update,
      sql: UPDATE,
      values: ['x', '1'],
      expectedRows: 1,
      row: { isNew: false, index: 0 },
      label: 'id = 1',
    },
  ],
  deletions: 0,
  summary: '1 update on sales.orders',
}

function partsWith(approval: Approval, engine: ScriptedEngine): RunParts {
  const session = { engine: POSTGRES_ENGINE, engineSession: engine.session(), close: vi.fn() }
  const uri = { toString: () => 'untitled:Untitled-1', path: 'Untitled-1', scheme: 'untitled' }
  return {
    target: {
      uri: uri as unknown as vscode.Uri,
      connection: SHOP,
      engine: { ...POSTGRES_ENGINE, dialect: POSTGRES_DIALECT },
      scope: { database: 'shop', schema: 'sales' },
    },
    session,
    catalog: engine.session(),
    panel: {} as RunParts['panel'],
    run: new ActiveRun(),
    approval,
  }
}

describe('runBatch', () => {
  it('should refuse to run a statement the guards did not approve, before running anything', async () => {
    const engine = new ScriptedEngine()
    const log = recordingLogger()
    const context = {
      transactions: new EditorTransactions({ defaultMode: () => TransactionMode.Auto, log }),
      log,
      closeSession: vi.fn(),
    }

    await expect(
      runBatch(context, partsWith(new Approval(new Map()), engine), PLAN),
    ).rejects.toThrow('sqldoro did not check this statement before running it, so it did not run')
    expect(engine.requests).toStrictEqual([])
  })
})
