import { describe, expect, it } from 'vitest'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { ColumnLayouts } from './column-layouts.ts'

const ORDERS = { database: 'shop', schema: 'sales', name: 'orders' }
const HIDE_NOTE = { order: ['code'], hidden: ['note'] }
const KEY = 'sqldoro.columnLayouts'

describe('ColumnLayouts', () => {
  it('should keep the layout of a table in the state of the workspace', async () => {
    const memento = new FakeMemento()
    const sut = new ColumnLayouts(memento, recordingLogger())

    await sut.save('shop', ORDERS, HIDE_NOTE)

    expect(sut.get('shop', ORDERS)).toStrictEqual(HIDE_NOTE)
    expect(new ColumnLayouts(memento, recordingLogger()).get('shop', ORDERS)).toStrictEqual(
      HIDE_NOTE,
    )
  })

  it('should drop the layouts of connections that are gone, writing only when some went', async () => {
    const memento = new FakeMemento()
    const sut = new ColumnLayouts(memento, recordingLogger())
    await sut.save('shop', ORDERS, HIDE_NOTE)
    await sut.save('crm', ORDERS, HIDE_NOTE)

    await sut.retain(new Set(['shop', 'crm']))
    const before = memento.get(KEY)
    await sut.retain(new Set(['shop']))

    expect(memento.get(KEY)).not.toBe(before)
    expect(sut.get('crm', ORDERS)).toStrictEqual({ order: [], hidden: [] })
    expect(sut.get('shop', ORDERS)).toStrictEqual(HIDE_NOTE)
  })

  it('should say what it cannot read, and leave layouts of a newer version as they are', async () => {
    const log = recordingLogger()
    const newer = { version: 9, layouts: [] }
    const memento = new FakeMemento()
    await memento.update(KEY, newer)

    const sut = new ColumnLayouts(memento, log)
    await sut.save('shop', ORDERS, HIDE_NOTE)

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      'The column layouts cannot be read: their format (version 9) is not supported',
    )
    expect(sut.get('shop', ORDERS)).toStrictEqual(HIDE_NOTE)
    expect(memento.get(KEY)).toStrictEqual(newer)
  })
})
