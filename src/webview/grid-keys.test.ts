import type { KeyboardEvent } from 'react'
import { describe, expect, it, type Mock, vi } from 'vitest'

import { type GridSelection, selectCell } from '../core/grid/selection.ts'
import { handleGridKey } from './grid-keys.ts'

const BOUNDS = { rowCount: 10, columnCount: 3, pageSize: 4 }
const MIDDLE = selectCell({ row: 5, column: 1 })

interface Press {
  readonly modifiers?: Readonly<Record<string, boolean>>
  readonly isOwnTarget?: boolean
  readonly selection?: GridSelection | null
}

interface Pressed {
  readonly actions: { select: Mock; copy: Mock; openDetail: Mock }
  readonly isPrevented: boolean
}

const DEFAULTS = { modifiers: {}, isOwnTarget: true, selection: MIDDLE }

function press(key: string, options: Press = {}): Pressed {
  const { modifiers, isOwnTarget, selection } = { ...DEFAULTS, ...options }
  const actions = { select: vi.fn(), copy: vi.fn(), openDetail: vi.fn() }
  const target = {}
  let isPrevented = false
  const event = {
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
    key,
    target,
    currentTarget: isOwnTarget ? target : {},
    preventDefault: () => {
      isPrevented = true
    },
  } as unknown as KeyboardEvent
  handleGridKey(event, { selection: selection ?? undefined, bounds: BOUNDS }, actions)
  return { actions, isPrevented }
}

describe('handleGridKey', () => {
  it.each([
    ['ArrowUp', { row: 4, column: 1 }],
    ['ArrowDown', { row: 6, column: 1 }],
    ['ArrowLeft', { row: 5, column: 0 }],
    ['ArrowRight', { row: 5, column: 2 }],
    ['PageUp', { row: 1, column: 1 }],
    ['PageDown', { row: 9, column: 1 }],
    ['Home', { row: 5, column: 0 }],
    ['End', { row: 5, column: 2 }],
  ])('should move the focus with %s', (key, focus) => {
    const { actions, isPrevented } = press(key)

    expect(actions.select).toHaveBeenCalledWith({ anchor: focus, focus })
    expect(isPrevented).toBe(true)
  })

  it('should extend the selection with Shift', () => {
    expect(
      press('ArrowDown', { modifiers: { shiftKey: true } }).actions.select,
    ).toHaveBeenCalledWith({
      anchor: { row: 5, column: 1 },
      focus: { row: 6, column: 1 },
    })
  })

  it('should go to the first and last cells with Ctrl or Cmd and Home or End', () => {
    expect(press('Home', { modifiers: { ctrlKey: true } }).actions.select).toHaveBeenCalledWith(
      selectCell({ row: 0, column: 0 }),
    )
    expect(press('End', { modifiers: { metaKey: true } }).actions.select).toHaveBeenCalledWith(
      selectCell({ row: 9, column: 2 }),
    )
  })

  it('should select all and copy with Ctrl or Cmd', () => {
    expect(press('a', { modifiers: { ctrlKey: true } }).actions.select).toHaveBeenCalledWith({
      anchor: { row: 0, column: 0 },
      focus: { row: 9, column: 2 },
    })
    expect(press('C', { modifiers: { metaKey: true } }).actions.copy).toHaveBeenCalledOnce()
  })

  it('should open the value of the focused cell with Enter', () => {
    expect(press('Enter').actions.openDetail).toHaveBeenCalledWith({ row: 5, column: 1 })
  })

  it('should start from the first cell without a selection', () => {
    expect(press('ArrowRight', { selection: null }).actions.select).toHaveBeenCalledWith(
      selectCell({ row: 0, column: 1 }),
    )
  })

  it('should leave other keys, keys of a filter and empty grids alone', () => {
    for (const result of [
      press('x'),
      press('z', { modifiers: { ctrlKey: true } }),
      press('F2', { modifiers: { ctrlKey: true } }),
      press('ArrowDown', { isOwnTarget: false }),
    ]) {
      expect(result.isPrevented).toBe(false)
      expect(result.actions.select).not.toHaveBeenCalled()
    }
  })
})

describe('an empty grid', () => {
  it('should not move anywhere', () => {
    const actions = { select: vi.fn(), copy: vi.fn(), openDetail: vi.fn() }
    const target = {}
    handleGridKey(
      {
        key: 'ArrowDown',
        target,
        currentTarget: target,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent,
      { selection: undefined, bounds: { rowCount: 0, columnCount: 2, pageSize: 1 } },
      actions,
    )

    expect(actions.select).not.toHaveBeenCalled()
  })
})
