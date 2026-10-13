import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MYSQL_LEXICAL } from '../../test/fixtures/lexical.ts'
import { shownView, type ShownView } from '../../test/webview/result-view.ts'
import type { ResultTab } from '../core/results/protocol.ts'

const TABLE: Partial<ResultTab> = {
  canRefresh: true,
  meta: [
    { choices: [], reference: '' },
    { choices: ['ann', 'bob'], reference: '' },
  ],
}

let view: ShownView

function where(changes: Partial<ResultTab> = {}): HTMLInputElement {
  view = shownView({ changes: { ...TABLE, ...changes } })
  return field()
}

function field(): HTMLInputElement {
  return screen.getByRole('combobox', { name: 'WHERE condition' })
}

function type(text: string): void {
  fireEvent.change(field(), { target: { value: text, selectionStart: text.length } })
}

function suggestions(): (string | null)[] {
  return within(screen.getByRole('listbox', { name: 'Suggestions' }))
    .getAllByRole('option')
    .map((option) => option.querySelector('.suggestion-label')?.textContent ?? null)
}

function spans(): string[] {
  return [...document.querySelectorAll('.where-highlight span span')].map(
    (span) => `${span.className}:${span.textContent}`,
  )
}

describe('the WHERE of a table', () => {
  it('should color the condition as it is typed', () => {
    where()

    type("name = 'ann' AND id > 2")

    expect(spans()).toStrictEqual([
      'sql-identifier:name',
      'sql-plain: ',
      'sql-operator:=',
      'sql-plain: ',
      "sql-string:'ann'",
      'sql-plain: ',
      'sql-keyword:AND',
      'sql-plain: ',
      'sql-identifier:id',
      'sql-plain: ',
      'sql-operator:>',
      'sql-plain: ',
      'sql-number:2',
    ])
  })

  it('should color it as the SQL of the connection is written', () => {
    view = shownView({
      changes: TABLE,
      context: { sql: { identifierQuote: '`', lexical: MYSQL_LEXICAL, keywords: ['REGEXP'] } },
    })

    type('name regexp `x` # a comment')

    expect(spans()).toStrictEqual([
      'sql-identifier:name',
      'sql-plain: ',
      'sql-keyword:regexp',
      'sql-plain: ',
      'sql-identifier:`x`',
      'sql-plain: ',
      'sql-comment:# a comment',
    ])
  })

  it('should suggest the columns that start with what is typed, and take one with Enter', () => {
    where()

    type('na')
    expect(suggestions()).toStrictEqual(['name'])
    expect(field().getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(field(), { key: 'Enter' })

    expect(field().value).toBe('name')
    expect(field().selectionStart).toBe(4)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(view.sent('filterTable')).toStrictEqual([])
  })

  it('should suggest the operators after a column, and the values of an enum after one', () => {
    where()

    type('name ')
    expect(suggestions()).toContain('=')
    type('name = ')
    expect(suggestions()).toStrictEqual(['ann', 'bob'])
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field().getAttribute('aria-activedescendant')).toBe('where-suggestions-tab-1-1')
    fireEvent.keyDown(field(), { key: 'Tab' })

    expect(field().value).toBe("name = 'bob'")
  })

  it('should take a suggestion with a click, keeping the focus in the field', () => {
    where()
    type('i')

    const option = screen.getByRole('option', { name: /id/ })
    expect(fireEvent.mouseDown(option)).toBe(false)

    expect(field().value).toBe('id')
  })

  it('should suggest names and keywords when asked with Ctrl+Space', () => {
    where()
    type('id = 1 ')
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.keyDown(field(), { key: ' ', code: 'Space', ctrlKey: true })

    expect(suggestions()).toEqual(expect.arrayContaining(['id', 'name', 'AND', 'OR']))
  })

  it('should hide the suggestions with Escape or when the field loses the focus', () => {
    where()
    type('na')

    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.keyDown(field(), { key: 'Escape' })
    type('na')
    fireEvent.blur(field())

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('should apply the condition with Enter when no suggestion shows', () => {
    where()
    type('id > 2')

    fireEvent.keyDown(field(), { key: 'Enter' })

    expect(view.sent('filterTable')).toStrictEqual([
      { type: 'filterTable', tabId: 'tab-1', condition: 'id > 2' },
    ])
  })

  it('should keep its colored copy under the text as the field scrolls', () => {
    where()
    type('id > 2')

    Object.defineProperty(field(), 'scrollLeft', { configurable: true, value: 40 })
    fireEvent.scroll(field())

    expect(document.querySelector<HTMLElement>('.where-highlight > span')?.style.transform).toBe(
      'translateX(-40px)',
    )
  })
})

describe('the expand button of the WHERE', () => {
  it('should ask the panel for its query box, and open no editor', () => {
    const toggle = vi.fn()
    view = shownView({ changes: TABLE, context: { queryMode: { isOn: false, toggle } } })

    fireEvent.click(screen.getByRole('button', { name: 'Edit the Query (Ctrl+Shift+E)' }))

    expect(toggle).toHaveBeenCalledOnce()
    expect(view.sent('openInEditor')).toStrictEqual([])
  })

  it('should show no suggestions for what nothing starts with', () => {
    where()

    type('zzz')

    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field().getAttribute('aria-expanded')).toBe('false')
  })
})
