import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { EditPreview } from '../core/results/protocol.ts'
import { PreviewDialog } from './PreviewDialog.tsx'

const PREVIEW: EditPreview = {
  id: 7,
  summary: '2 changes to sales.orders',
  statements: [
    {
      sql: 'UPDATE "sales"."orders" SET "name" = $1 WHERE "id" = $2',
      values: ["'bob'", '1'],
      expectedRows: 1,
      label: 'Row 1',
    },
    {
      sql: 'INSERT INTO "sales"."orders" DEFAULT VALUES',
      values: [],
      expectedRows: 2,
      label: 'New row 1',
    },
  ],
  deletions: 0,
  isInOpenTransaction: false,
}

function renderDialog(changes: Partial<EditPreview> = {}): {
  readonly onApply: ReturnType<typeof vi.fn>
  readonly onClose: ReturnType<typeof vi.fn>
} {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(<PreviewDialog preview={{ ...PREVIEW, ...changes }} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}

function statementTexts(): (string | null)[] {
  return within(screen.getByRole('list', { name: 'Statements' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)
}

describe('PreviewDialog', () => {
  it('should show each statement as it will run, with its values and the rows it must change', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Apply 2 changes to sales.orders?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(
      screen.getByText('They run in one transaction: all of them apply, or none.'),
    ).toBeDefined()
    expect(statementTexts()).toStrictEqual([
      `Row 1 · must change 1 rowUPDATE "sales"."orders" SET "name" = $1 WHERE "id" = $2Values, in order: 'bob', 1`,
      'New row 1 · must change 2 rowsINSERT INTO "sales"."orders" DEFAULT VALUES',
    ])
    expect(screen.queryByText(/They delete/)).toBeNull()
  })

  it('should say when the statements join the open transaction, and how many rows they delete', () => {
    renderDialog({ isInOpenTransaction: true, deletions: 1 })

    expect(
      screen.getByText(
        'They run in the open transaction of this editor, inside a savepoint: commit the transaction to keep them.',
      ),
    ).toBeDefined()
    expect(
      screen.getByText('They delete 1 row: you confirm how many before they run.'),
    ).toBeDefined()
  })

  it('should give the focus to Cancel, and close with it or with Escape', () => {
    const { onApply, onClose } = renderDialog({ deletions: 3 })
    expect(
      screen.getByText('They delete 3 rows: you confirm how many before they run.'),
    ).toBeDefined()

    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.click(cancel)
    expect(fireEvent.keyDown(cancel, { key: 'Escape' })).toBe(false)
    expect(fireEvent.keyDown(cancel, { key: 'Enter' })).toBe(true)

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('should apply the statements of the preview it shows', () => {
    const { onApply, onClose } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Apply 2 Statements' }))

    expect(onApply).toHaveBeenCalledWith(7)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('should name a single statement', () => {
    renderDialog({ statements: PREVIEW.statements.slice(0, 1) })

    expect(screen.getByRole('button', { name: 'Apply 1 Statement' })).toBeDefined()
  })
})
