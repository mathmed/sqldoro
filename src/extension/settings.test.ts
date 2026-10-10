import { beforeEach, describe, expect, it } from 'vitest'

import { resetVscode, settings } from '../../test/vscode.ts'
import { readSettings } from './settings.ts'

beforeEach(() => {
  resetVscode()
})

describe('readSettings', () => {
  it('should read the defaults when nothing is set', () => {
    expect(readSettings()).toStrictEqual({
      maxRows: 100_000,
      historySize: 500,
      autoLimit: 1000,
      policy: { productionEnvironments: new Set(['prod']) },
      transactionMode: 'auto',
    })
  })

  it('should read whole numbers inside their range', () => {
    settings.set('sqldoro.results.maxRows', 2500.7)
    settings.set('sqldoro.history.maxEntriesPerConnection', 0)
    settings.set('sqldoro.autoLimit.rows', 0)

    expect(readSettings()).toMatchObject({ maxRows: 2500, historySize: 1, autoLimit: 1 })

    settings.set('sqldoro.results.maxRows', 9_000_000)
    settings.set('sqldoro.history.maxEntriesPerConnection', 20_000)
    settings.set('sqldoro.autoLimit.rows', 9_000_000)
    expect(readSettings()).toMatchObject({
      maxRows: 5_000_000,
      historySize: 10_000,
      autoLimit: 5_000_000,
    })
  })

  it('should take the default for a value that is not a number', () => {
    settings.set('sqldoro.results.maxRows', 'many')
    settings.set('sqldoro.history.maxEntriesPerConnection', Number.NaN)
    settings.set('sqldoro.autoLimit.rows', '200')

    expect(readSettings()).toMatchObject({ maxRows: 100_000, historySize: 500, autoLimit: 1000 })
  })

  it('should turn automatic limits off only when asked to', () => {
    settings.set('sqldoro.autoLimit.rows', 250)
    settings.set('sqldoro.autoLimit.enabled', 'no')
    expect(readSettings().autoLimit).toBe(250)

    settings.set('sqldoro.autoLimit.enabled', false)
    expect(readSettings().autoLimit).toBeNull()
  })

  it('should treat the environments listed as production, and prod always', () => {
    settings.set('sqldoro.safety.productionEnvironments', ['staging', 'unknown'])
    expect(readSettings().policy.productionEnvironments).toStrictEqual(new Set(['prod', 'staging']))

    settings.set('sqldoro.safety.productionEnvironments', 'staging')
    expect(readSettings().policy.productionEnvironments).toStrictEqual(new Set(['prod']))
  })

  it('should start editors in the transaction mode set, or in auto-commit', () => {
    settings.set('sqldoro.transactions.defaultMode', 'manual')
    expect(readSettings().transactionMode).toBe('manual')

    settings.set('sqldoro.transactions.defaultMode', 'sometimes')
    expect(readSettings().transactionMode).toBe('auto')
  })
})
