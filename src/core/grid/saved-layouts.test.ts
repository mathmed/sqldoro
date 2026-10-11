import { describe, expect, it } from 'vitest'

import { decodeList, encodeList } from '../json/versioned-list.ts'
import { DEFAULT_LAYOUT } from './column-layout.ts'
import {
  layoutFor,
  MAX_SAVED_LAYOUTS,
  retainLayouts,
  SAVED_LAYOUT_FORMAT,
  type SavedLayout,
  storedLayout,
  withSavedLayout,
} from './saved-layouts.ts'

const ORDERS = { database: 'shop', schema: 'sales', name: 'orders' }
const LINES = { database: 'shop', schema: 'sales', name: 'lines' }
const HIDE_NOTE = { order: ['code'], hidden: ['note'] }
const SAVED: SavedLayout = { connectionId: 'shop', table: ORDERS, layout: HIDE_NOTE }

describe('SAVED_LAYOUT_FORMAT', () => {
  it('should read back what it stored', () => {
    const stored = encodeList([storedLayout(SAVED)], [], SAVED_LAYOUT_FORMAT)

    const sut = decodeList(stored, SAVED_LAYOUT_FORMAT)

    expect(stored).toStrictEqual({
      version: 1,
      layouts: [
        {
          connectionId: 'shop',
          database: 'shop',
          schema: 'sales',
          name: 'orders',
          order: ['code'],
          hidden: ['note'],
        },
      ],
    })
    expect(sut).toStrictEqual({ items: [SAVED], unreadable: [], problems: [], isWritable: true })
  })

  it('should keep an entry it cannot read, and say why', () => {
    const sut = decodeList({ version: 1, layouts: [{ connectionId: 7 }] }, SAVED_LAYOUT_FORMAT)

    expect(sut.items).toStrictEqual([])
    expect(sut.unreadable).toStrictEqual([{ connectionId: 7 }])
    expect(sut.problems).toHaveLength(1)
    expect(sut.problems[0]).toContain('Column layout')
  })
})

describe('layoutFor', () => {
  it('should give the layout of a table of a connection, or the default one', () => {
    expect(layoutFor([SAVED], 'shop', ORDERS)).toBe(HIDE_NOTE)
    expect(layoutFor([SAVED], 'shop', LINES)).toBe(DEFAULT_LAYOUT)
    expect(layoutFor([SAVED], 'crm', ORDERS)).toBe(DEFAULT_LAYOUT)
  })
})

describe('withSavedLayout', () => {
  it('should put the layout of a table last, in place of the one it had', () => {
    const lines = { connectionId: 'shop', table: LINES, layout: HIDE_NOTE }
    const changed = { ...SAVED, layout: { order: [], hidden: ['id'] } }

    const sut = withSavedLayout([SAVED, lines], changed)

    expect(sut).toStrictEqual([lines, changed])
  })

  it('should not keep a layout that changes nothing', () => {
    const sut = withSavedLayout([SAVED], { ...SAVED, layout: DEFAULT_LAYOUT })

    expect(sut).toStrictEqual([])
  })

  it('should keep the most recent layouts only', () => {
    const many = Array.from({ length: MAX_SAVED_LAYOUTS }, (...[, index]) => ({
      ...SAVED,
      table: { ...ORDERS, name: `t${String(index)}` },
    }))

    const sut = withSavedLayout(many, SAVED)

    expect(sut).toHaveLength(MAX_SAVED_LAYOUTS)
    expect(sut.at(0)?.table.name).toBe('t1')
    expect(sut.at(-1)).toBe(SAVED)
  })
})

describe('retainLayouts', () => {
  it('should drop the layouts of connections that are gone', () => {
    const crm = { ...SAVED, connectionId: 'crm' }

    expect(retainLayouts([SAVED, crm], new Set(['crm']))).toStrictEqual([crm])
  })
})

describe('SAVED_LAYOUT_FORMAT, written by a newer version', () => {
  it('should name the column layouts it cannot read', () => {
    const sut = decodeList({ version: 9, layouts: [] }, SAVED_LAYOUT_FORMAT)

    expect(sut.problems).toStrictEqual([
      'The column layouts cannot be read: their format (version 9) is not supported',
    ])
  })
})
