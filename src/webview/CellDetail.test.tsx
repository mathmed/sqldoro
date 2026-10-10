import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ColumnKind } from '../core/engine/query.ts'
import { CellDetail } from './CellDetail.tsx'
import { PlanView } from './PlanView.tsx'

const DOC = { name: 'doc', dataType: 'JSONB', kind: ColumnKind.Json }

describe('CellDetail', () => {
  it('should show the whole value of the cell, JSON indented, and close', () => {
    const onClose = vi.fn()
    render(<CellDetail column={DOC} value='{"a":1}' onClose={onClose} />)

    expect(screen.getByRole('complementary', { name: 'Value of doc' }).textContent).toContain(
      'doc · JSONB',
    )
    expect(screen.getByText(/"a": 1/).textContent).toBe('{\n  "a": 1\n}')
    fireEvent.click(screen.getByRole('button', { name: 'Close the value' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('should show the start of a value too long for it and say how to get all of it', () => {
    const value = 'x'.repeat(250_000)
    render(<CellDetail column={DOC} value={value} onClose={vi.fn()} />)

    expect(screen.getByRole('note').textContent).toBe(
      'Showing the first 200,000 of 250,000 characters: copy the cell (Ctrl+C) or export the result to get all of it.',
    )
    expect(screen.getByText(/^x+$/).textContent).toHaveLength(200_000)
  })

  it('should wait for a value on its way', () => {
    render(<CellDetail column={DOC} value={undefined} onClose={vi.fn()} />)

    expect(screen.getByText('Loading…')).toBeDefined()
  })
})

describe('PlanView', () => {
  it('should show the plan line by line', () => {
    render(<PlanView lines={['Seq Scan on orders', '  Filter: (id > 1)']} />)

    expect(screen.getByLabelText('Query plan').textContent).toBe(
      'Seq Scan on orders\n  Filter: (id > 1)',
    )
  })
})
