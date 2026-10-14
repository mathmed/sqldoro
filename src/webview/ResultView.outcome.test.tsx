import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL } from '../../test/fixtures/lexical.ts'
import { shownView } from '../../test/webview/result-view.ts'
import type { ResultTab } from '../core/results/protocol.ts'

// An UPDATE that ran: no result set, three rows changed.
const UPDATED: Partial<ResultTab> = {
  title: 'UPDATE orders SET paid = 1',
  sql: 'UPDATE orders SET paid = 1',
  columns: [],
  rowCount: 0,
  loadedRows: 0,
  summary: { durationMs: 12, affectedRows: 3, isTruncated: false, autoLimit: null },
}
const MYSQL_SQL = { identifierQuote: '`', lexical: MYSQL_LEXICAL, keywords: [] }

describe('the result view of a statement without a result set', () => {
  it('should show its outcome in place of an empty grid, without the tools of rows', () => {
    shownView({ changes: UPDATED })

    expect(screen.getByRole('status').textContent).toBe('UPDATE: 3 rows affected · 12 ms')
    expect(screen.getByTitle('UPDATE orders SET paid = 1').textContent).toBe(
      'UPDATE orders SET paid = 1',
    )
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(document.querySelector('.result-footer')).toBeNull()
  })

  it('should name the statement with the rules of the dialect, and show what it notes', () => {
    shownView({
      changes: {
        ...UPDATED,
        sql: '# move\nALTER TABLE orders ADD note text',
        summary: { durationMs: 40, affectedRows: 0, isTruncated: false, autoLimit: null },
        notice: 'The transaction was committed.',
      },
      context: { sql: MYSQL_SQL },
    })

    expect(screen.getByRole('status').textContent).toBe('ALTER TABLE done · 40 ms')
    expect(screen.getByText('The transaction was committed.')).toBeDefined()
  })

  it('should keep the message of the server of a statement that failed, as before', () => {
    shownView({
      changes: {
        ...UPDATED,
        status: 'failed',
        summary: null,
        error: { message: 'relation "orders" does not exist', line: null, column: null },
      },
    })

    expect(screen.getByRole('status').textContent).toBe('relation "orders" does not exist')
    expect(document.querySelector('.result-footer')).not.toBeNull()
    expect(document.querySelector('.outcome')).toBeNull()
  })
})
