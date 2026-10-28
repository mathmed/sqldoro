import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { StatusLine } from './StatusLine.tsx'

function line(changes: Partial<ResultTab>): string | null {
  const { unmount } = render(
    <StatusLine tab={resultTab(changes)} hiddenColumns={0} onShowColumns={vi.fn()} />,
  )
  const text = screen.getByRole('status').textContent
  unmount()
  return text
}

describe('StatusLine', () => {
  it('should count the rows while the statement runs', () => {
    expect(line({ status: 'running', loadedRows: 1500, rowCount: 1500, summary: null })).toBe(
      'Running… 1,500 rows so far',
    )
  })

  it('should say a cancel is on its way until the statement stops', () => {
    expect(
      line({
        status: 'running',
        progress: 'cancelling',
        loadedRows: 3,
        rowCount: 3,
        summary: null,
      }),
    ).toBe('Cancelling…')
  })

  it('should say how many rows came back and how long it took', () => {
    expect(line({ loadedRows: 2, rowCount: 2 })).toBe('2 rows in 13 ms')
  })

  it('should say how many rows a filtered view shows, and when the server sorted them', () => {
    expect(line({ loadedRows: 2000, rowCount: 3 })).toBe('2,000 rows in 13 ms · showing 3 of 2,000')
    expect(line({ isServerView: true })).toBe('2 rows in 13 ms · sorted and filtered by the server')
  })

  it('should show the error of the server and where it points', () => {
    expect(
      line({
        status: 'failed',
        summary: null,
        error: { message: 'syntax error', line: 3, column: 7 },
      }),
    ).toBe('syntax error (line 3, column 7)')
    expect(
      line({
        status: 'failed',
        summary: null,
        error: { message: 'denied', line: null, column: null },
      }),
    ).toBe('denied')
    expect(
      line({ status: 'failed', summary: null, error: { message: 'odd', line: 2, column: null } }),
    ).toBe('odd (line 2, column 1)')
  })

  it('should say when the statement was cancelled, and what did not run', () => {
    expect(
      line({
        status: 'cancelled',
        summary: { durationMs: 2500, affectedRows: null, isTruncated: false, autoLimit: null },
        notice: '1 statement after this one did not run.',
      }),
    ).toBe('Cancelled after 2.50 s · 1 statement after this one did not run.')
  })

  it('should say nothing more without a summary', () => {
    expect(line({ summary: null })).toBe('')
  })
})
