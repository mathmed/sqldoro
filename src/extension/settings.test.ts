import { beforeEach, describe, expect, it } from 'vitest'

import { resetVscode, settings } from '../../test/vscode.ts'
import { readSettings } from './settings.ts'

beforeEach(() => {
  resetVscode()
})

describe('readSettings', () => {
  it('should read the defaults when nothing is set', () => {
    expect(readSettings()).toStrictEqual({ maxRows: 100_000, historySize: 500 })
  })

  it('should read whole numbers inside their range', () => {
    settings.set('sqldoro.results.maxRows', 2500.7)
    settings.set('sqldoro.history.maxEntriesPerConnection', 0)

    expect(readSettings()).toStrictEqual({ maxRows: 2500, historySize: 1 })

    settings.set('sqldoro.results.maxRows', 9_000_000)
    settings.set('sqldoro.history.maxEntriesPerConnection', 20_000)
    expect(readSettings()).toStrictEqual({ maxRows: 5_000_000, historySize: 10_000 })
  })

  it('should take the default for a value that is not a number', () => {
    settings.set('sqldoro.results.maxRows', 'many')
    settings.set('sqldoro.history.maxEntriesPerConnection', Number.NaN)

    expect(readSettings()).toStrictEqual({ maxRows: 100_000, historySize: 500 })
  })
})
