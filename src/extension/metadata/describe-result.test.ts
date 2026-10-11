import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSession } from '../../../test/fakes/engine.ts'
import { type RecordingLogger, recordingLogger } from '../../../test/fakes/logger.ts'
import { ORDERS, ORDERS_RESULT, ordersColumn } from '../../../test/fixtures/tables.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { ColumnKind } from '../../core/engine/query.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { SchemaCache } from '../completion/schema-cache.ts'
import type { RunParts } from '../editor/run-types.ts'
import { describeResult } from './describe-result.ts'
import { TableMetadata } from './table-metadata.ts'

const NOTE_FK = {
  name: 'orders_note',
  columns: ['note'],
  referencedSchema: 'sales',
  referencedTable: 'notes',
  referencedColumns: ['text'],
  onUpdate: 'NO ACTION',
  onDelete: 'NO ACTION',
}

let log: RecordingLogger
let updateTab: ReturnType<typeof vi.fn>

function partsOn(catalog: EngineSession): RunParts {
  return {
    target: {
      connection: { id: 'shop' },
      engine: { dialect: { hasSchemas: true } },
      scope: { database: 'shop', schema: 'sales' },
    },
    catalog,
    panel: { updateTab },
  } as unknown as RunParts
}

function ordersTab(): ResultSet {
  const tab = new ResultSet({
    id: 'tab-1',
    sql: 'SELECT * FROM sales.orders',
    values: [],
    kind: TabKind.Rows,
    canServerView: true,
    canRefresh: false,
  })
  tab.describe(ORDERS_RESULT)
  return tab
}

beforeEach(() => {
  log = recordingLogger()
  updateTab = vi.fn()
})

describe('describeResult', () => {
  it('should tell the view where the foreign keys of the columns lead', async () => {
    const tab = ordersTab()
    const catalog = fakeSession({
      describeTable: async () => Promise.resolve(ORDERS),
      listForeignKeys: async () => Promise.resolve([NOTE_FK]),
    })

    await describeResult(partsOn(catalog), tab, {
      metadata: new TableMetadata(new SchemaCache(log)),
      log,
    })

    expect(tab.toTab().meta.at(2)).toStrictEqual({ choices: [], reference: 'notes (text)' })
    expect(updateTab).toHaveBeenCalledExactlyOnceWith(tab, true)
  })

  it('should leave columns of no table the catalog knows without links', async () => {
    const tab = ordersTab()
    tab.describe([...ORDERS_RESULT, { name: 'total', dataType: 'INT8', kind: ColumnKind.Number }])

    await describeResult(partsOn(fakeSession()), tab, {
      metadata: new TableMetadata(new SchemaCache(log)),
      log,
    })

    expect(tab.meta.links).toStrictEqual([])
    expect(updateTab).toHaveBeenCalledOnce()
  })

  it('should leave a tab whose columns changed meanwhile as it is', async () => {
    const tab = ordersTab()
    const catalog = fakeSession({
      describeTable: async () => {
        tab.describe([ordersColumn('id')])
        return Promise.resolve(ORDERS)
      },
    })

    await describeResult(partsOn(catalog), tab, {
      metadata: new TableMetadata(new SchemaCache(log)),
      log,
    })

    expect(updateTab).not.toHaveBeenCalled()
  })

  it('should say why in the log when the catalog cannot be read', async () => {
    const tab = ordersTab()
    const catalog = fakeSession({
      describeTable: async () => Promise.reject(new Error('connection lost')),
    })

    await describeResult(partsOn(catalog), tab, {
      metadata: new TableMetadata(new SchemaCache(log)),
      log,
    })

    expect(updateTab).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not read the links of a result from the catalog'),
    )
  })
})
