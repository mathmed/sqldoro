import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  box,
  heightOf,
  lines,
  openTable,
  part,
  toggleWithKeys,
  typeInBox,
} from '../../test/webview/query-box.ts'
import { fromHost } from '../../test/webview/vscode-api.ts'
import { BOX_LINE_HEIGHT, BOX_PADDING } from '../core/grid/query-mode.ts'

describe('typing in the query box', () => {
  it('should suggest the tables of the schema, under the word, and take one', () => {
    const panel = openTable()
    toggleWithKeys()
    typeInBox('SELECT *\nFROM ord')

    const list = screen.getByRole('listbox', { name: 'Suggestions' })
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toStrictEqual(['orderstable', 'order_linestable', 'ORDERkeyword'])
    expect(list.style.top).toBe(`${String(4 + 2 * BOX_LINE_HEIGHT)}px`)
    expect(list.style.left).toBe('calc(5ch + 8px)')
    expect(box().getAttribute('aria-activedescendant')).toBe('query-suggestions-0')

    fireEvent.keyDown(box(), { key: 'Enter' })

    expect(box().value).toBe('SELECT *\nFROM orders')
    expect(panel.sent('runQuery')).toStrictEqual([])
  })

  it('should run with Ctrl+Enter whatever is suggested, and hide the suggestions', () => {
    const panel = openTable()
    toggleWithKeys()
    typeInBox('SELECT * FROM ord')
    expect(screen.getByRole('listbox', { name: 'Suggestions' })).toBeDefined()

    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true })

    expect(panel.sent('runQuery')).toStrictEqual([{ type: 'runQuery', sql: 'SELECT * FROM ord' }])
    expect(screen.queryByRole('listbox', { name: 'Suggestions' })).toBeNull()
  })

  it('should indent with Tab, and keep the text on Escape', () => {
    openTable()
    toggleWithKeys()
    typeInBox('SELECT 1\nFROM x', 9)
    box().setSelectionRange(9, 9)

    fireEvent.keyDown(box(), { key: 'Tab' })
    expect(box().value).toBe('SELECT 1\n  FROM x')
    fireEvent.keyDown(box(), { key: 'Tab', shiftKey: true })
    fireEvent.keyDown(box(), { key: 'Escape' })

    expect(box().value).toBe('SELECT 1\n  FROM x')
  })

  it('should move its colored copy as its text scrolls', () => {
    openTable()
    toggleWithKeys()

    fireEvent.scroll(box(), { target: { scrollLeft: 30, scrollTop: 18 } })

    expect(part('.query-highlight code').style.transform).toBe('translate(-30px, -18px)')
  })
})

describe('the height of the query box', () => {
  it('should grow with its text up to the height kept for the workspace', () => {
    openTable()
    toggleWithKeys()
    expect(heightOf()).toBe(lines(2))

    typeInBox('SELECT\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10')
    expect(heightOf()).toBe(lines(8))

    fromHost({ type: 'queryBox', tables: [], height: 4 * BOX_LINE_HEIGHT + BOX_PADDING })
    expect(heightOf()).toBe(lines(4))
  })

  it('should follow the edge as it is dragged, then keep the height for the workspace', () => {
    const panel = openTable()
    toggleWithKeys()
    typeInBox('SELECT\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10')
    const grip = screen.getByRole('separator', { name: 'Height of the query box' })

    fireEvent.mouseDown(grip, { clientY: 300 })
    fireEvent.mouseMove(window, { clientY: 260 })
    expect(heightOf()).toBe(`${String(8 * BOX_LINE_HEIGHT + BOX_PADDING - 40)}px`)
    expect(document.querySelector('.query-field.is-resizing')).not.toBeNull()
    fireEvent.mouseUp(window, { clientY: 250 })
    fireEvent.mouseMove(window, { clientY: 100 })

    const kept = 8 * BOX_LINE_HEIGHT + BOX_PADDING - 50
    expect(heightOf()).toBe(`${String(kept)}px`)
    expect(panel.sent('setQueryHeight')).toStrictEqual([{ type: 'setQueryHeight', height: kept }])
  })

  it('should move its edge a line at a time with the arrow keys, within half the panel', () => {
    openTable()
    toggleWithKeys()
    typeInBox('SELECT\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10')
    const grip = screen.getByRole('separator', { name: 'Height of the query box' })

    fireEvent.keyDown(grip, { key: 'ArrowUp' })
    expect(heightOf()).toBe(lines(7))
    fireEvent.keyDown(grip, { key: 'ArrowDown' })
    fireEvent.keyDown(grip, { key: 'Home' })
    expect(heightOf()).toBe(lines(8))

    const panelHeight = window.innerHeight
    act(() => {
      window.innerHeight = 100
      window.dispatchEvent(new Event('resize'))
    })
    expect(heightOf()).toBe('50px')
    window.innerHeight = panelHeight
  })
})
