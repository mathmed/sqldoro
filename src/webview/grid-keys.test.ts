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
  readonly isEditable?: boolean
}

interface Actions {
  readonly select: Mock
  readonly copy: Mock
  readonly openDetail: Mock
  readonly canEdit: Mock<() => boolean>
  readonly edit: Mock
  readonly deleteRows: Mock
  readonly preview: Mock
}

interface Pressed {
  readonly actions: Actions
  readonly isPrevented: boolean
}

function keyActions(isEditable = false): Actions {
  return {
    select: vi.fn(),
    copy: vi.fn(),
    openDetail: vi.fn(),
    canEdit: vi.fn(() => isEditable),
    edit: vi.fn(),
    deleteRows: vi.fn(),
    preview: vi.fn(),
  }
}

const DEFAULTS = { modifiers: {}, isOwnTarget: true, selection: MIDDLE, isEditable: false }

function press(key: string, options: Press = {}): Pressed {
  const { modifiers, isOwnTarget, selection, isEditable } = { ...DEFAULTS, ...options }
  const actions = keyActions(isEditable)
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

describe('handleGridKey, editing', () => {
  it('should edit a cell that takes values with Enter or F2, from its value', () => {
    for (const key of ['Enter', 'F2']) {
      const { actions, isPrevented } = press(key, { isEditable: true })

      expect(actions.edit).toHaveBeenCalledWith({ row: 5, column: 1 }, undefined)
      expect(actions.openDetail).not.toHaveBeenCalled()
      expect(isPrevented).toBe(true)
    }
  })

  it('should show the whole value of a cell that takes none with Enter, and of any with Shift+Enter', () => {
    expect(press('Enter').actions.openDetail).toHaveBeenCalledWith({ row: 5, column: 1 })
    const shifted = press('Enter', { isEditable: true, modifiers: { shiftKey: true } })
    expect(shifted.actions.openDetail).toHaveBeenCalledWith({ row: 5, column: 1 })
    expect(shifted.actions.edit).not.toHaveBeenCalled()
  })

  it('should start editing with the character typed on a cell that takes values', () => {
    const typed = press('K', { isEditable: true, modifiers: { shiftKey: true } })

    expect(typed.actions.edit).toHaveBeenCalledWith({ row: 5, column: 1 }, 'K')
    expect(typed.isPrevented).toBe(true)
  })

  it('should leave typing and F2 alone where cells take no value, and Alt with a character', () => {
    for (const result of [
      press('k'),
      press('F2'),
      press('k', { isEditable: true, modifiers: { altKey: true } }),
    ]) {
      expect(result.actions.edit).not.toHaveBeenCalled()
      expect(result.isPrevented).toBe(false)
    }
  })

  it('should delete the selected rows with Delete and preview the changes with Ctrl or Cmd and S', () => {
    expect(press('Delete').actions.deleteRows).toHaveBeenCalledOnce()
    expect(press('s', { modifiers: { ctrlKey: true } }).actions.preview).toHaveBeenCalledOnce()
    expect(press('S', { modifiers: { metaKey: true } }).actions.preview).toHaveBeenCalledOnce()
  })
})

describe('an empty grid', () => {
  it('should not move anywhere', () => {
    const actions = keyActions()
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
