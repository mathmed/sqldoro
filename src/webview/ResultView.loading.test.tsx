import { act, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cellAt } from '../../test/webview/grid.ts'
import { shownView, type ShownView } from '../../test/webview/result-view.ts'
import { FADE_MS, MIN_SHOWN_MS, SHOW_DELAY_MS } from '../core/grid/loading-indicator.ts'
import type { ResultTab } from '../core/results/protocol.ts'

const RUNNING: Partial<ResultTab> = { status: 'running', summary: null }

let view: ShownView

// The card counts in ticks of a tenth of a second.
const TICK_MS = 100

function card(): HTMLElement | null {
  return document.querySelector('.loading-card')
}

function theCard(): HTMLElement {
  const found = card()
  if (found === null) {
    throw new Error('no loading card')
  }
  return found
}

function classOf(selector: string): string | undefined {
  return document.querySelector(selector)?.className
}

function wait(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a wait of the view', () => {
  it('should show nothing for a wait that ends before the delay', () => {
    view = shownView()
    view.rerender({ changes: { ...RUNNING, progress: 'running' } })
    wait(SHOW_DELAY_MS - 1)
    expect(card()).toBeNull()
    expect(classOf('.loading-overlay')).toBe('loading-overlay')

    view.rerender({})
    wait(SHOW_DELAY_MS * 2)

    expect(card()).toBeNull()
    expect(classOf('.result-main')).toBe('result-main')
  })

  it('should say what it waits for, how long it has waited, and cancel it', () => {
    view = shownView({ changes: { ...RUNNING, progress: 'connecting' } })
    wait(SHOW_DELAY_MS)
    expect(card()?.textContent).toBe('Connecting…300 msCancel')
    expect(classOf('.loading-overlay')).toBe('loading-overlay is-shown')

    view.rerender({ changes: { ...RUNNING, progress: 'running' } })
    wait(1000)
    expect(card()?.textContent).toBe('Running query…1.30 sCancel')
    view.rerender({ changes: { ...RUNNING, progress: 'fetching', loadedRows: 1500 } })
    expect(card()?.textContent).toContain('Fetching rows… 1,500 rows so far')
    fireEvent.click(within(theCard()).getByRole('button', { name: 'Cancel' }))

    expect(view.sent('cancel')).toStrictEqual([{ type: 'cancel' }])
  })

  it('should keep the card long enough to read, stop its time, then fade it out', () => {
    view = shownView({ changes: { ...RUNNING, progress: 'running' } })
    wait(SHOW_DELAY_MS + TICK_MS)
    view.rerender({})
    wait(MIN_SHOWN_MS - TICK_MS - 1)
    expect(card()?.textContent).toBe('Fetching rows… 4 rows so far400 msCancel')
    expect(classOf('.loading-overlay')).toBe('loading-overlay is-shown')

    wait(1)
    expect(classOf('.loading-overlay')).toBe('loading-overlay')
    expect(card()).not.toBeNull()
    wait(FADE_MS)

    expect(card()).toBeNull()
  })

  it('should show it again at once when a new wait begins while it fades', () => {
    view = shownView({ changes: { ...RUNNING, progress: 'running' } })
    wait(SHOW_DELAY_MS)
    view.rerender({})
    wait(MIN_SHOWN_MS)
    expect(classOf('.loading-overlay')).toBe('loading-overlay')

    view.rerender({ changes: { ...RUNNING, progress: 'running' } })

    expect(classOf('.loading-overlay')).toBe('loading-overlay is-shown')
    expect(card()?.textContent).toBe('Running query…0 msCancel')
  })
})

describe('the result of before', () => {
  it('should stay as it was, then dim once the wait shows, until the new one comes', () => {
    view = shownView()
    view.rerender({ incoming: { ...RUNNING, viewVersion: 1, progress: 'running' } })
    expect(classOf('.result-main')).toBe('result-main')
    expect(cellAt(0, 1).textContent).toBe('ann')

    wait(SHOW_DELAY_MS)
    expect(classOf('.result-main')).toBe('result-main is-dimmed')
    expect(card()?.textContent).toContain('Running query…')
    expect(cellAt(0, 1).textContent).toBe('ann')
    view.rerender({})

    expect(classOf('.result-main')).toBe('result-main')
  })

  it('should leave the rows of its tab usable, and those of a tab a new run replaced not', () => {
    view = shownView()
    view.rerender({ incoming: { ...RUNNING, viewVersion: 1 } })
    expect(document.querySelector('.result-content')?.hasAttribute('inert')).toBe(false)

    view.rerender({ incoming: { ...RUNNING, id: 'tab-2' } })

    expect(document.querySelector('.result-content')?.hasAttribute('inert')).toBe(true)
  })

  it('should ask for the rows of the new view of its tab where the grid is', () => {
    view = shownView()

    view.rerender({ incoming: { status: 'succeeded', viewVersion: 1, rowCount: 4 } })

    expect(view.sent('fetchRows')).toContainEqual({
      type: 'fetchRows',
      tabId: 'tab-1',
      viewVersion: 1,
      start: 0,
      count: 200,
    })
  })
})

describe('a result without rows yet', () => {
  it('should stay out of sight in its place until the wait shows, then show a skeleton', () => {
    view = shownView({ changes: { ...RUNNING, columns: [], viewVersion: 1, rowCount: 0 } })
    expect(classOf('.result-view')).toBe('result-view is-pending')
    expect(document.querySelector('.skeleton')).toBeNull()

    wait(SHOW_DELAY_MS)

    expect(classOf('.result-view')).toBe('result-view is-empty')
    expect(document.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0)
    expect(classOf('.result-main')).toBe('result-main')
  })

  it('should put the rows that stream in where the skeleton was, and show the rest at the end', () => {
    view = shownView({ changes: { ...RUNNING, viewVersion: 1, rowCount: 4 } })
    wait(SHOW_DELAY_MS)
    expect(document.querySelector('.skeleton')).not.toBeNull()

    streamZoe()
    expect(document.querySelector('.skeleton')).toBeNull()
    expect(cellAt(0, 1).textContent).toBe('zoe')
    expect(classOf('.result-view')).toBe('result-view is-empty')
    view.rerender({ changes: { viewVersion: 1, rowCount: 4 } })

    expect(classOf('.result-view')).toBe('result-view')
  })

  it('should show at once, whole, when it ends with its first rows before the delay', () => {
    view = shownView({ changes: { ...RUNNING, viewVersion: 1, rowCount: 4 } })
    streamZoe()
    expect(classOf('.result-view')).toBe('result-view is-pending')

    view.rerender({ changes: { viewVersion: 1, rowCount: 4 } })

    expect(classOf('.result-view')).toBe('result-view')
    expect(cellAt(0, 1).textContent).toBe('zoe')
  })
})

function streamZoe(): void {
  act(() => {
    view.store.windowsToFetch({ first: 0, last: 3 }, 4, 1)
    view.store.store(1, 0, [{ cells: ['7', 'zoe'], truncated: [] }])
  })
}
