import { describe, expect, it } from 'vitest'

import type { Crumb } from '../navigation/history.ts'
import {
  BOX_LINE_HEIGHT,
  BOX_PADDING,
  boxCap,
  boxHeight,
  type BoxPlace,
  boxText,
  hasBox,
  isBoxShown,
  MIN_BOX_HEIGHT,
  originStep,
  storedHeight,
  toggleBox,
  WHERE_MODE,
  withDraft,
  withoutDraft,
} from './query-mode.ts'

const TABLE = { id: 'rows', queryBox: { sql: 'SELECT * FROM orders LIMIT 100', isCustom: false } }
const QUERY = { id: 'query', queryBox: { sql: 'SELECT 1', isCustom: true } }
const EDITOR = { id: 'editor', queryBox: null }
const ON_TABLE: readonly Crumb[] = [
  { id: 4, label: 'customers #1', isCurrent: false, isQuery: false },
  { id: 7, label: 'orders', isCurrent: true, isQuery: false },
]
const ON_QUERY: readonly Crumb[] = [
  { id: 7, label: 'orders', isCurrent: false, isQuery: false },
  { id: 9, label: 'Query', isCurrent: true, isQuery: true },
]
const TABLE_PLACE: BoxPlace = { tab: TABLE, crumbs: ON_TABLE }
const QUERY_PLACE: BoxPlace = { tab: QUERY, crumbs: ON_QUERY }
const OPEN = { ...WHERE_MODE, isOpen: true }

describe('hasBox and isBoxShown', () => {
  it('should give a box to the tabs of table panels only', () => {
    expect(hasBox(TABLE)).toBe(true)
    expect(hasBox(QUERY)).toBe(true)
    expect(hasBox(EDITOR)).toBe(false)
    expect(hasBox(undefined)).toBe(false)
  })

  it('should show it once opened, and always with the result of a query unless closed on it', () => {
    expect(isBoxShown(WHERE_MODE, TABLE)).toBe(false)
    expect(isBoxShown(OPEN, TABLE)).toBe(true)
    expect(isBoxShown(OPEN, EDITOR)).toBe(false)
    expect(isBoxShown(OPEN, undefined)).toBe(false)
    expect(isBoxShown(WHERE_MODE, QUERY)).toBe(true)
    expect(isBoxShown({ ...WHERE_MODE, closedOn: 'query' }, QUERY)).toBe(false)
    expect(isBoxShown({ ...WHERE_MODE, closedOn: 'query' }, { ...QUERY, id: 'next' })).toBe(true)
  })
})

describe('toggleBox', () => {
  it('should open the box on the rows of a table, and close it again in place', () => {
    const opened = toggleBox({ ...WHERE_MODE, closedOn: 'old' }, TABLE_PLACE)
    expect(opened).toStrictEqual({ mode: { ...OPEN, closedOn: null }, goTo: null })

    expect(toggleBox(opened.mode, TABLE_PLACE)).toStrictEqual({
      mode: { ...WHERE_MODE, closedOn: null },
      goTo: null,
    })
  })

  it('should go back to the rows a query was run from when it closes on its result', () => {
    expect(toggleBox(OPEN, QUERY_PLACE)).toStrictEqual({
      mode: { ...WHERE_MODE, closedOn: 'query' },
      goTo: 7,
    })
    expect(
      toggleBox(WHERE_MODE, {
        tab: QUERY,
        crumbs: [{ id: 2, label: 'Query', isCurrent: true, isQuery: true }],
      }),
    ).toStrictEqual({ mode: { ...WHERE_MODE, closedOn: 'query' }, goTo: null })
  })

  it('should open it again on a result it was closed on', () => {
    const closed = { ...WHERE_MODE, closedOn: 'query' }

    expect(toggleBox(closed, QUERY_PLACE)).toStrictEqual({
      mode: { ...OPEN, closedOn: null },
      goTo: null,
    })
  })

  it('should do nothing where there is no box', () => {
    expect(toggleBox(WHERE_MODE, { tab: EDITOR, crumbs: [] })).toStrictEqual({
      mode: WHERE_MODE,
      goTo: null,
    })
    expect(toggleBox(OPEN, { tab: undefined, crumbs: ON_TABLE }).mode).toBe(OPEN)
  })
})

describe('originStep', () => {
  it('should write from the step shown, or from the step a query was run from', () => {
    expect(originStep(TABLE_PLACE)).toBe(7)
    expect(originStep(QUERY_PLACE)).toBe(7)
    expect(
      originStep({
        tab: QUERY,
        crumbs: [{ id: 3, label: 'Query', isCurrent: true, isQuery: true }],
      }),
    ).toBe(3)
    expect(originStep({ tab: TABLE, crumbs: [] })).toBe(-1)
    expect(originStep({ tab: undefined, crumbs: ON_TABLE })).toBe(7)
  })

  it('should follow the trail while the rows a query was run from are still on screen', () => {
    expect(originStep({ tab: TABLE, crumbs: ON_QUERY })).toBe(7)
    expect(
      boxText(withDraft(OPEN, TABLE_PLACE, 'SELECT 2'), { tab: TABLE, crumbs: ON_QUERY }),
    ).toBe('SELECT 2')
  })
})

describe('boxText, withDraft and withoutDraft', () => {
  it('should show the statement of the tab until the user writes', () => {
    expect(boxText(OPEN, TABLE_PLACE)).toBe('SELECT * FROM orders LIMIT 100')
    expect(boxText(OPEN, QUERY_PLACE)).toBe('SELECT 1')
    expect(boxText(OPEN, { tab: undefined, crumbs: [] })).toBe('')
    expect(boxText(OPEN, { tab: EDITOR, crumbs: [] })).toBe('')
  })

  it('should keep what the user wrote for the step it was written from', () => {
    const written = withDraft(OPEN, TABLE_PLACE, 'SELECT id FROM orders')

    expect(boxText(written, TABLE_PLACE)).toBe('SELECT id FROM orders')
    expect(boxText(written, QUERY_PLACE)).toBe('SELECT id FROM orders')
    expect(
      boxText(written, {
        tab: TABLE,
        crumbs: [{ id: 4, label: 'customers #1', isCurrent: true, isQuery: false }],
      }),
    ).toBe('SELECT * FROM orders LIMIT 100')
    expect(OPEN.drafts.size).toBe(0)
  })

  it('should not keep the statement of the tab itself, nor what was reset', () => {
    const written = withDraft(OPEN, TABLE_PLACE, 'SELECT id FROM orders')

    expect(withDraft(written, TABLE_PLACE, 'SELECT * FROM orders LIMIT 100').drafts.size).toBe(0)
    expect(withoutDraft(written, QUERY_PLACE).drafts.size).toBe(0)
    expect(withoutDraft(written, { tab: TABLE, crumbs: [] }).drafts.size).toBe(1)
    expect(written.drafts.size).toBe(1)
  })
})

describe('boxCap and boxHeight', () => {
  const lines = (count: number): number => count * BOX_LINE_HEIGHT + BOX_PADDING

  it('should let the box grow to 8 lines, or the height chosen, within 2 lines and half the panel', () => {
    expect(MIN_BOX_HEIGHT).toBe(lines(2))
    expect(boxCap(null, 1000)).toBe(lines(8))
    expect(boxCap(300, 1000)).toBe(300)
    expect(boxCap(10, 1000)).toBe(lines(2))
    expect(boxCap(900, 1000)).toBe(500)
    expect(boxCap(900, 1001)).toBe(500)
    expect(boxCap(null, 40)).toBe(lines(2))
  })

  it('should be as tall as its text, from 2 lines up to the cap', () => {
    expect(boxHeight('SELECT 1', 300)).toBe(lines(2))
    expect(boxHeight('SELECT 1\nFROM t\nWHERE x', 300)).toBe(lines(3))
    expect(boxHeight('\n'.repeat(40), 300)).toBe(300)
  })
})

describe('storedHeight', () => {
  it('should read a height the box can take, and nothing else', () => {
    expect(storedHeight(180)).toBe(180)
    expect(storedHeight(0)).toBe(0)
    expect(storedHeight(4000)).toBe(4000)
    expect(storedHeight(4001)).toBeNull()
    expect(storedHeight(-1)).toBeNull()
    expect(storedHeight(12.5)).toBeNull()
    expect(storedHeight('180')).toBeNull()
    expect(storedHeight(undefined)).toBeNull()
  })
})
