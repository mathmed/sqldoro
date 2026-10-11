import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ColumnKind } from '../core/engine/query.ts'
import { type Condition, type FilteredColumn, FilterPopover } from './FilterPopover.tsx'
import type { DistinctValues } from './FilterValues.tsx'

const AMOUNT: FilteredColumn = { name: 'amount', kind: ColumnKind.Number, choices: [] }
const NAME: FilteredColumn = { name: 'name', kind: ColumnKind.Text, choices: [] }
const STATUS: FilteredColumn = { name: 'status', kind: ColumnKind.Text, choices: ['open', 'paid'] }

interface Opened {
  readonly onApply: ReturnType<typeof vi.fn>
  readonly onClose: ReturnType<typeof vi.fn>
  readonly onFetchDistinct: ReturnType<typeof vi.fn>
}

function popover(
  column: FilteredColumn,
  { filters = [], distinct }: { filters?: readonly Condition[]; distinct?: DistinctValues } = {},
): Opened {
  const opened = { onApply: vi.fn(), onClose: vi.fn(), onFetchDistinct: vi.fn() }
  render(
    <FilterPopover
      column={column}
      filters={filters}
      distinct={distinct}
      place={{ top: 0, left: 0 }}
      onDismiss={vi.fn()}
      {...opened}
    />,
  )
  return opened
}

function operator(index = 0): HTMLSelectElement {
  const found = screen.getAllByRole<HTMLSelectElement>('combobox', { name: 'Operator' }).at(index)
  if (found === undefined) {
    throw new Error(`no operator ${String(index)}`)
  }
  return found
}

function options(select: HTMLSelectElement): string[] {
  return [...select.options].map((option) => option.text)
}

describe('FilterPopover', () => {
  it('should offer the operators of the kind of the column', () => {
    popover(AMOUNT)

    expect(options(operator())).toStrictEqual([
      '=',
      '≠',
      '<',
      '≤',
      '>',
      '≥',
      'between',
      'in',
      'is null',
      'is not null',
    ])
  })

  it('should take the two ends of a range, and apply what all of them meet', () => {
    const { onApply, onClose } = popover(AMOUNT)

    fireEvent.change(operator(), { target: { value: 'between' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'From amount' }), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'To amount' }), {
      target: { value: '20' },
    })
    fireEvent.click(screen.getByRole('button', { name: '+ And another condition' }))
    fireEvent.change(operator(1), { target: { value: 'isNotNull' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledExactlyOnceWith([
      { operator: 'between', values: ['10', '20'] },
      { operator: 'isNotNull', values: [] },
    ])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('should leave out the conditions not filled in, and remove one on request', () => {
    const { onApply } = popover(NAME, {
      filters: [
        { operator: 'contains', values: ['a'] },
        { operator: 'endsWith', values: ['z'] },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }))
    fireEvent.click(screen.getByRole('button', { name: '+ And another condition' }))
    const [ends] = screen.getAllByRole('textbox', { name: 'Value of name' })
    fireEvent.keyDown(ends ?? document.body, { key: 'Enter' })

    expect(onApply).toHaveBeenCalledExactlyOnceWith([{ operator: 'endsWith', values: ['z'] }])
  })

  it('should pick the value of an enum from its values', () => {
    const { onApply } = popover(STATUS)
    expect(operator().value).toBe('inList')

    fireEvent.change(operator(), { target: { value: 'equals' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Value of status' }), {
      target: { value: 'paid' },
    })
    fireEvent.change(operator(), { target: { value: 'unknown' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledExactlyOnceWith([{ operator: 'equals', values: ['paid'] }])
  })

  it('should check the values of an enum for a list, found by a search', () => {
    const { onApply, onFetchDistinct } = popover(STATUS)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the values' }), {
      target: { value: 'PA' },
    })
    expect(
      screen.getAllByRole('checkbox').map((box) => box.parentElement?.textContent),
    ).toStrictEqual(['paid'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'paid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledExactlyOnceWith([{ operator: 'inList', values: ['paid'] }])
    expect(onFetchDistinct).not.toHaveBeenCalled()
  })

  it('should list the values the column holds, and add one that is not listed', () => {
    const { onApply, onFetchDistinct } = popover(NAME, {
      filters: [{ operator: 'inList', values: ['zoe'] }],
      distinct: { values: ['', 'ann'], isComplete: false },
    })
    const search = screen.getByRole('searchbox', { name: 'Search the values' })

    expect(
      screen.getAllByRole('checkbox').map((box) => box.parentElement?.textContent),
    ).toStrictEqual(['zoe', '(empty)', 'ann'])
    expect(screen.getByText(/Only the first 500 values are listed/)).toBeDefined()
    fireEvent.click(screen.getByRole('checkbox', { name: 'zoe' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '(empty)' }))
    fireEvent.change(search, { target: { value: 'max' } })
    fireEvent.keyDown(search, { key: 'Enter', altKey: true })
    fireEvent.keyDown(search, { key: 'Enter', altKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApply).toHaveBeenCalledExactlyOnceWith([{ operator: 'inList', values: ['', 'max'] }])
    expect(onFetchDistinct).not.toHaveBeenCalled()
  })

  it('should close as it was with Escape, and leave Enter outside a field alone', () => {
    const { onApply, onClose } = popover(NAME, { filters: [{ operator: 'isNull', values: [] }] })

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('should clear the filter of the column', () => {
    const { onApply } = popover(NAME, { filters: [{ operator: 'isNull', values: [] }] })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onApply).toHaveBeenCalledExactlyOnceWith([])
  })
})
