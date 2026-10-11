import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { type GridOptions, gridView, type GridView } from '../../test/webview/grid-view.ts'
import { cellAt, pickFromMenu } from '../../test/webview/grid.ts'
import type { ResultTab } from '../core/results/protocol.ts'

let view: GridView

function grid(changes: Partial<ResultTab> = {}, options: GridOptions = {}): void {
  view = gridView(changes, options)
}

function filterBox(name: string): HTMLInputElement {
  return within(screen.getByRole('dialog', { name: `Filter ${name}` })).getByRole('textbox', {
    name: `Value of ${name}`,
  })
}

describe('GridHeader', () => {
  it('should show the kind of each column before its name, and its type in the tooltip', () => {
    grid()

    const [id, name] = screen.getAllByRole('columnheader')
    expect(id?.querySelector('svg.kind-icon')?.getAttribute('class')).toBe('kind-icon kind-number')
    expect(name?.querySelector('svg.kind-icon')?.getAttribute('class')).toBe('kind-icon kind-text')
    expect(screen.getByRole('button', { name: 'id' }).title).toBe(
      'id: INT8 (number)\nClick to sort, Shift+click to sort by it too.',
    )
  })

  it('should list the values of an enum and what a foreign key points at in the tooltip', () => {
    const choices = Array.from({ length: 22 }, (...[, index]) => `v${String(index)}`)
    grid({
      meta: [
        { choices: [], reference: 'customers (id)' },
        { choices, reference: '' },
      ],
    })

    expect(screen.getByRole('button', { name: 'id' }).title).toBe(
      'id: INT8 (number)\nReferences customers (id)\nClick to sort, Shift+click to sort by it too.',
    )
    expect(screen.getByRole('button', { name: 'name' }).title).toContain(
      `Values: ${choices.slice(0, 20).join(', ')}, …`,
    )
  })

  it('should hide a column from the menu of its header', () => {
    grid()

    pickFromMenu('Actions of name', 'Hide column')

    expect(view.asks.onHide).toHaveBeenCalledWith(1)
  })

  it('should sort by a column, ascending first, and turn a sort around', () => {
    grid({ view: { sort: [{ column: 1, isDescending: false }], filters: [] } })

    fireEvent.click(screen.getByRole('button', { name: 'id' }))
    fireEvent.click(screen.getByRole('button', { name: /^name/ }))

    expect(view.views()).toStrictEqual([
      { sort: [{ column: 0, isDescending: false }], filters: [] },
      { sort: [{ column: 1, isDescending: true }], filters: [] },
    ])
  })

  it('should sort by several columns with Shift', () => {
    grid({ view: { sort: [{ column: 0, isDescending: false }], filters: [] } })

    fireEvent.click(screen.getByRole('button', { name: 'name' }), { shiftKey: true })

    expect(view.views()).toStrictEqual([
      {
        sort: [
          { column: 0, isDescending: false },
          { column: 1, isDescending: false },
        ],
        filters: [],
      },
    ])
  })

  it('should show the sort in the headers, and where each column comes in a sort by several', () => {
    grid({
      view: {
        sort: [
          { column: 1, isDescending: false },
          { column: 0, isDescending: true },
        ],
        filters: [],
      },
    })

    expect(
      screen
        .getAllByRole('columnheader')
        .map((header) => [
          header.getAttribute('aria-sort'),
          header.querySelector('.sort-mark')?.textContent,
        ]),
    ).toStrictEqual([
      ['descending', ' ▼2'],
      ['ascending', ' ▲1'],
    ])
  })

  it('should mark the sort of one column without its place', () => {
    grid({ view: { sort: [{ column: 0, isDescending: false }], filters: [] } })

    expect(screen.getAllByRole('columnheader')[0]?.querySelector('.sort-mark')?.textContent).toBe(
      ' ▲',
    )
    expect(screen.getAllByRole('columnheader')[1]?.querySelector('.sort-mark')).toBeNull()
  })

  it('should sort and copy the name of a column from the menu of its header', () => {
    grid({ view: { sort: [{ column: 0, isDescending: false }], filters: [] } })

    pickFromMenu('Actions of name', 'Sort descending')
    pickFromMenu('Actions of name', 'Sort ascending')
    pickFromMenu('Actions of id', 'Clear sort')
    pickFromMenu('Actions of name', 'Copy column name')

    expect(view.views()).toStrictEqual([
      { sort: [{ column: 1, isDescending: true }], filters: [] },
      { sort: [{ column: 1, isDescending: false }], filters: [] },
      { sort: [], filters: [] },
    ])
    expect(view.api.posted()).toContainEqual({ type: 'copyColumnName', tabId: 'tab-1', column: 1 })
  })

  it('should not offer to clear a sort the column does not have', () => {
    grid()

    fireEvent.click(screen.getByRole('button', { name: 'Actions of name' }))

    expect(screen.getByRole<HTMLButtonElement>('menuitem', { name: 'Clear sort' }).disabled).toBe(
      true,
    )
  })

  it('should filter a column from the popover under its header, Enter applying it', () => {
    grid({ view: { sort: [], filters: [{ column: 1, operator: 'contains', values: ['b'] }] } })
    const filter = screen.getByRole('button', { name: 'Filter name' })
    expect(filter).toMatchObject({
      className: 'header-action is-active',
      title: "Filtered: name contains 'b'",
    })
    expect(screen.getByRole('button', { name: 'Filter id' }).className).toBe('header-action')

    fireEvent.click(filter)
    expect(document.activeElement).toBe(filterBox('name'))
    expect(filterBox('name').value).toBe('b')
    fireEvent.change(filterBox('name'), { target: { value: 'an' } })
    fireEvent.keyDown(filterBox('name'), { key: 'Enter' })

    expect(view.views()).toStrictEqual([
      { sort: [], filters: [{ column: 1, operator: 'contains', values: ['an'] }] },
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(filter)
  })

  it('should close the filter of a column with Escape, giving the focus back to its header', () => {
    grid()
    const filter = screen.getByRole('button', { name: 'Filter id' })

    fireEvent.click(filter)
    fireEvent.change(filterBox('id'), { target: { value: '7' } })
    fireEvent.keyDown(filterBox('id'), { key: 'a' })
    fireEvent.keyDown(filterBox('id'), { key: 'Escape' })

    expect(view.views()).toStrictEqual([])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(filter)
  })

  it('should apply or clear the filter of a column with the buttons of its popover', () => {
    grid({ view: { sort: [], filters: [{ column: 0, operator: 'contains', values: ['7'] }] } })

    pickFromMenu('Actions of id', 'Filter…')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    pickFromMenu('Actions of name', 'Filter…')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Clear' }).disabled).toBe(true)
    fireEvent.change(filterBox('name'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(view.views()).toStrictEqual([
      { sort: [], filters: [] },
      {
        sort: [],
        filters: [
          { column: 0, operator: 'contains', values: ['7'] },
          { column: 1, operator: 'contains', values: ['x'] },
        ],
      },
    ])
  })

  it('should dismiss the filter of a column with a click elsewhere', () => {
    grid()
    fireEvent.click(screen.getByRole('button', { name: 'Filter id' }))

    fireEvent.mouseDown(filterBox('id'))
    expect(screen.getByRole('dialog')).toBeDefined()
    fireEvent.mouseDown(cellAt(0, 0))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(view.views()).toStrictEqual([])
  })

  it('should lock the sort and the filters while the statement runs', () => {
    grid({ status: 'running', summary: null })

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Filter id' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'id' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Actions of id' }))
    expect(
      screen
        .getAllByRole<HTMLButtonElement>('menuitem')
        .map((item) => [item.textContent, item.disabled]),
    ).toStrictEqual([
      ['Sort ascending', true],
      ['Sort descending', true],
      ['Clear sort', true],
      ['Filter…', true],
      ['Copy column name', false],
      ['Hide column', false],
    ])
  })

  it('should resize a column by dragging its edge', () => {
    grid()
    const header = screen.getAllByRole('columnheader')[1]
    const separator = screen.getAllByRole('separator', { name: 'Resize the column' })[1]
    if (header === undefined || separator === undefined) {
      throw new Error('no second column')
    }
    const before = Number.parseInt(header.style.width, 10)

    fireEvent.mouseDown(separator, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 160 })
    fireEvent.mouseUp(document, { clientX: 160 })

    expect(Number.parseInt(header.style.width, 10)).toBe(before + 60)
    expect(cellAt(0, 1).style.width).toBe(`${String(before + 60)}px`)
  })

  it('should list the values the host gave for the column, to pick from', () => {
    grid(
      {},
      {
        distinct: {
          type: 'distinct',
          tabId: 'tab-1',
          column: 1,
          values: ['ann'],
          isComplete: true,
        },
      },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter name' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Operator' }), {
      target: { value: 'inList' },
    })

    expect(view.asks.onFetchDistinct).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'ann' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(view.views()).toStrictEqual([
      { sort: [], filters: [{ column: 1, operator: 'inList', values: ['ann'] }] },
    ])
  })

  it('should ask for the values of a column, not taking those of another', () => {
    grid(
      {},
      {
        distinct: { type: 'distinct', tabId: 'tab-1', column: 0, values: ['7'], isComplete: true },
      },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter name' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Operator' }), {
      target: { value: 'inList' },
    })

    expect(screen.queryByRole('checkbox', { name: '7' })).toBeNull()
    expect(screen.getByText('Loading values…')).toBeDefined()
    expect(view.asks.onFetchDistinct).toHaveBeenCalledWith(1)
  })
})
