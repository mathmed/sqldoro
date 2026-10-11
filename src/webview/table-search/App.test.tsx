import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { type FakeVsCodeApi, fakeVsCodeApi, fromHost } from '../../../test/webview/vscode-api.ts'
import type { SearchViewMessage } from '../../core/table-search/protocol.ts'
import { App } from './App.tsx'

const FOUND = { text: 'ord', matchCount: 12, connectionCount: 1, isLoading: false }

function opened(): FakeVsCodeApi<SearchViewMessage> {
  const api = fakeVsCodeApi<SearchViewMessage>()
  render(<App api={api} />)
  return api
}

function box(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('textbox', { name: 'Filter tables and views' })
}

function type(text: string): void {
  fireEvent.change(box(), { target: { value: text } })
}

describe('the table search box', () => {
  it('should tell the extension it is ready, and show the text it keeps', () => {
    const api = opened()

    fromHost({ type: 'setText', text: 'ord' })
    fromHost({ type: 'status', status: FOUND })

    expect(api.posted()).toStrictEqual([{ type: 'ready' }])
    expect(box().value).toBe('ord')
    expect(box().placeholder).toBe('Filter tables…')
    expect(screen.getByText('12')).toBeDefined()
    expect(
      screen.getByText('12 tables and views: Enter opens the best match, ↓ goes to the tree.'),
    ).toBeDefined()
  })

  it('should send every keystroke, at once', () => {
    const api = opened()

    type('o')
    type('or')
    type('ord')

    expect(api.posted().slice(1)).toStrictEqual([
      { type: 'search', text: 'o' },
      { type: 'search', text: 'or' },
      { type: 'search', text: 'ord' },
    ])
    expect(box().value).toBe('ord')
  })

  it('should say what to do before anything is typed, and when nothing is connected', () => {
    opened()
    fromHost({ type: 'status', status: { ...FOUND, text: '', matchCount: 0 } })
    expect(screen.getByText('Type part of the name of a table or view.')).toBeDefined()

    fromHost({ type: 'status', status: { ...FOUND, connectionCount: 0 } })
    expect(screen.getByText('Connect to a connection to find its tables.')).toBeDefined()
    expect(screen.queryByText('12')).toBeNull()
  })

  it('should clear the text with Escape or its button, and give the focus back', () => {
    const api = opened()
    type('ord')
    expect(screen.getByRole('button', { name: 'Clear (Escape)' })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clear (Escape)' }))
    expect(box().value).toBe('')
    expect(document.activeElement).toBe(box())
    expect(screen.queryByRole('button', { name: 'Clear (Escape)' })).toBeNull()

    type('lines')
    fireEvent.keyDown(box(), { key: 'Escape' })
    fireEvent.keyDown(box(), { key: 'Escape' })

    expect(
      api
        .posted()
        .filter(({ type: kind }) => kind === 'search')
        .at(-1),
    ).toStrictEqual({
      type: 'search',
      text: '',
    })
    expect(api.posted().filter(({ type: kind }) => kind === 'search')).toHaveLength(4)
  })

  it('should open the best match on Enter, and move to the tree on the down arrow', () => {
    const api = opened()

    const isEnterDefault = fireEvent.keyDown(box(), { key: 'Enter' })
    const isDownDefault = fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'a' })

    expect(api.posted().slice(1)).toStrictEqual([{ type: 'openBest' }, { type: 'focusTree' }])
    expect([isEnterDefault, isDownDefault]).toStrictEqual([false, false])
  })

  it('should take the focus with its text selected when asked, or when the view gets it', () => {
    const api = opened()
    fromHost({ type: 'setText', text: 'orders' })

    fromHost({ type: 'focus' })

    expect(document.activeElement).toBe(box())
    expect([box().selectionStart, box().selectionEnd]).toStrictEqual([0, 6])
    expect(api.posted().at(-1)).toStrictEqual({ type: 'focused' })
    act(() => {
      box().blur()
      window.dispatchEvent(new FocusEvent('focus'))
    })
    expect(document.activeElement).toBe(box())
  })

  it('should report a message of the extension it cannot read', () => {
    const api = opened()

    fromHost({ type: 'status', status: { ...FOUND, matchCount: -1 } })

    expect(api.posted().at(-1)).toStrictEqual({
      type: 'problem',
      message:
        'The table search received a message it cannot read: "matchCount" must be a whole number of 0 or more',
    })
  })
})
