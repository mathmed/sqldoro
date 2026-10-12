import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { cellAt, theGrid } from '../../test/webview/grid.ts'
import { shownView, type ShownView } from '../../test/webview/result-view.ts'
import type { PeekMessage, ResultTab } from '../core/results/protocol.ts'
import { PEEK_DELAY_MS } from './use-peek-hover.ts'

// A table panel: its tabs have a query box.
const TABLE_BOX = { sql: 'SELECT * FROM orders', isCustom: false }

// The name of a row is a link to the person of that name; row 1 has none (NULL).
const LINKED: Partial<ResultTab> = {
  meta: [
    { choices: [], reference: '' },
    { choices: [], reference: 'people (name)' },
  ],
  references: [{ label: 'orders (customer_id)' }],
}
const PEEK: PeekMessage = {
  type: 'peek',
  tabId: 'tab-1',
  viewVersion: 0,
  row: 0,
  column: 1,
  peek: { title: 'people #ann', columns: ['name', 'age'], values: ['ann', 42], problem: '' },
}

let view: ShownView

function linked(changes: Partial<ResultTab> = {}): ShownView {
  view = shownView({ changes: { ...LINKED, ...changes } })
  return view
}

function arrowOf(row: number): HTMLElement {
  return within(cellAt(row, 1)).getByRole('button', { name: 'Open the referenced row' })
}

function navigation(row: number, isInPlace: boolean): object {
  return { type: 'navigate', tabId: 'tab-1', viewVersion: 0, row, column: 1, isInPlace }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the links of a result', () => {
  it('should show a cell that points at a row as a link, not a NULL', () => {
    linked()

    expect(cellAt(0, 1).className).toContain('is-link')
    expect(arrowOf(0)).toBeDefined()
    expect(cellAt(1, 1).className).not.toContain('is-link')
    expect(cellAt(0, 0).className).not.toContain('is-link')
  })

  it('should open the row with Ctrl+click, Cmd+click or the arrow, and not with a plain click', () => {
    linked()

    fireEvent.click(cellAt(0, 1))
    fireEvent.click(cellAt(0, 1), { ctrlKey: true })
    fireEvent.click(cellAt(2, 1), { metaKey: true })
    fireEvent.click(arrowOf(3))
    fireEvent.click(cellAt(1, 1), { ctrlKey: true })

    expect(view.sent('navigate')).toStrictEqual([
      navigation(0, false),
      navigation(2, false),
      navigation(3, false),
    ])
  })

  it('should open the row in place with Alt+click in a table panel only', () => {
    linked()
    fireEvent.click(cellAt(0, 1), { altKey: true })
    expect(view.sent('navigate')).toStrictEqual([])

    view.rerender({ changes: { ...LINKED, canRefresh: true, queryBox: TABLE_BOX } })
    fireEvent.click(cellAt(0, 1), { altKey: true })

    expect(view.sent('navigate')).toStrictEqual([navigation(0, true)])
  })

  it('should open and peek from the keyboard', () => {
    linked()
    fireEvent.mouseDown(cellAt(0, 1))

    fireEvent.keyDown(theGrid(), { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(theGrid(), { key: 'Enter', altKey: true })

    expect(view.sent('navigate')).toStrictEqual([navigation(0, false)])
    expect(view.sent('peek')).toStrictEqual([
      { type: 'peek', tabId: 'tab-1', viewVersion: 0, row: 0, column: 1 },
    ])
    expect(screen.getByRole('dialog', { name: 'Referenced row' }).textContent).toContain('Loading…')
  })

  it('should leave the keys of links alone on a cell that is no link', () => {
    linked()
    fireEvent.mouseDown(cellAt(1, 1))

    fireEvent.keyDown(theGrid(), { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(theGrid(), { key: 'Enter', altKey: true })

    expect(view.sent('navigate')).toStrictEqual([])
    expect(view.sent('peek')).toStrictEqual([])
  })
})

describe('peeking at the row a link points at', () => {
  it('should peek once the pointer rests on the arrow, and not when it leaves before', () => {
    vi.useFakeTimers()
    linked()

    fireEvent.mouseEnter(arrowOf(2))
    fireEvent.mouseLeave(arrowOf(2))
    act(() => {
      vi.advanceTimersByTime(PEEK_DELAY_MS)
    })
    expect(view.sent('peek')).toStrictEqual([])
    fireEvent.mouseEnter(arrowOf(0))
    act(() => {
      vi.advanceTimersByTime(PEEK_DELAY_MS)
    })

    expect(view.sent('peek')).toHaveLength(1)
  })

  it('should show a few columns of the row once the host sends it, and open it from there', () => {
    linked({ canRefresh: true, queryBox: TABLE_BOX })
    fireEvent.mouseDown(cellAt(0, 1))
    fireEvent.keyDown(theGrid(), { key: 'Enter', altKey: true })

    view.rerender({
      changes: { ...LINKED, canRefresh: true, queryBox: TABLE_BOX },
      answers: { peek: PEEK },
    })
    const popup = screen.getByRole('dialog', { name: 'Referenced row' })
    expect(popup.textContent).toBe('people #annnameannage42OpenOpen Here')
    fireEvent.click(within(popup).getByRole('button', { name: 'Open Here' }))

    expect(view.sent('navigate')).toStrictEqual([navigation(0, true)])
    expect(screen.queryByRole('dialog', { name: 'Referenced row' })).toBeNull()
  })

  it('should say why the row cannot be shown, and close with Escape', () => {
    linked()
    fireEvent.mouseDown(cellAt(0, 1))
    fireEvent.keyDown(theGrid(), { key: 'Enter', altKey: true })

    view.rerender({
      changes: LINKED,
      answers: {
        peek: { ...PEEK, peek: { title: '', columns: [], values: [], problem: 'Gone.' } },
      },
    })
    const popup = screen.getByRole('dialog', { name: 'Referenced row' })
    expect(popup.textContent).toBe('Gone.Open')
    fireEvent.keyDown(popup, { key: 'a' })
    expect(screen.getByRole('dialog', { name: 'Referenced row' })).toBeDefined()
    fireEvent.keyDown(popup, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Referenced row' })).toBeNull()
  })

  it('should not take the answer for another cell', () => {
    linked()
    fireEvent.mouseDown(cellAt(2, 1))
    fireEvent.keyDown(theGrid(), { key: 'Enter', altKey: true })

    view.rerender({ changes: LINKED, answers: { peek: PEEK } })
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Referenced row' })).getByRole('button', {
        name: 'Open',
      }),
    )

    expect(screen.queryByText('people #ann')).toBeNull()
    expect(view.sent('navigate')).toStrictEqual([navigation(2, false)])
  })

  it('should keep the selection where it is when the arrow of a link is pressed', () => {
    linked()

    fireEvent.mouseDown(arrowOf(2))

    expect(theGrid().getAttribute('aria-activedescendant')).toBeNull()
  })
})
