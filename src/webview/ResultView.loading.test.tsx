import { act, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cellAt } from '../../test/webview/grid.ts'
import { shownView, type ShownView } from '../../test/webview/result-view.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { SHOW_AFTER_MS } from './LoadingCard.tsx'

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

describe('a statement that runs', () => {
  it('should show no card for a statement that ends at once', () => {
    view = shownView({ changes: { ...RUNNING, progress: 'running' } })

    wait(SHOW_AFTER_MS - 1)

    expect(card()).toBeNull()
  })

  it('should say what it waits for, how long it has taken, and cancel it', () => {
    view = shownView({ changes: { ...RUNNING, progress: 'connecting' } })
    wait(SHOW_AFTER_MS + TICK_MS)
    expect(card()?.textContent).toBe('Connecting…200 msCancel')

    view.rerender({ changes: { ...RUNNING, progress: 'running' } })
    wait(1000)
    expect(card()?.textContent).toBe('Running query…1.20 sCancel')
    view.rerender({ changes: { ...RUNNING, progress: 'fetching', loadedRows: 1500 } })
    expect(card()?.textContent).toContain('Fetching rows… 1,500 rows so far')
    fireEvent.click(within(theCard()).getByRole('button', { name: 'Cancel' }))

    expect(view.sent('cancel')).toStrictEqual([{ type: 'cancel' }])
  })

  it('should show a shimmer where the rows go before the first columns come', () => {
    view = shownView({ changes: { ...RUNNING, columns: [], progress: 'running' } })
    wait(SHOW_AFTER_MS + TICK_MS)

    expect(document.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0)
  })

  it('should dim the rows of before until the new ones come, then show them', () => {
    view = shownView()
    expect(document.querySelector('.result-main')?.className).toBe('result-main')

    view.rerender({ changes: { ...RUNNING, viewVersion: 1 } })
    expect(document.querySelector('.result-main')?.className).toBe('result-main is-busy')
    expect(cellAt(0, 1).textContent).toBe('ann')
    view.rerender({ changes: { viewVersion: 1 } })
    expect(document.querySelector('.result-main')?.className).toBe('result-main is-busy')
    act(() => {
      view.store.store(1, 0, [{ cells: ['7', 'zoe'], truncated: [] }])
    })

    expect(document.querySelector('.result-main')?.className).toBe('result-main')
    expect(cellAt(0, 1).textContent).toBe('zoe')
  })
})
