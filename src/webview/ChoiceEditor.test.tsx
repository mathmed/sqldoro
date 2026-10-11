import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, type Mock, vi } from 'vitest'

import { ValueType } from '../core/engine/table.ts'
import { CellEditor } from './CellEditor.tsx'
import { type CellEditorActions, EditorExit } from './editor-keys.ts'
import type { CellEditorView } from './use-cell-editor.ts'

const OPTIONS = ['open', '', 'paid']

interface Spies extends CellEditorActions {
  readonly change: Mock<(text: string) => void>
  readonly commit: Mock<(exit: EditorExit) => void>
  readonly put: Mock<(text: string, exit: EditorExit) => void>
  readonly cancel: Mock<() => void>
}

function editorActions(): Spies {
  return { change: vi.fn(), commit: vi.fn(), put: vi.fn(), cancel: vi.fn() }
}

function choiceEditor(text: string, isMultiple: boolean): Spies {
  const editor: CellEditorView = {
    position: { row: 0, column: 1 },
    spec: { type: ValueType.Choice, options: OPTIONS, isMultiple },
    text,
    problem: '',
  }
  const sut = editorActions()
  render(
    <div onMouseDown={vi.fn()}>
      <CellEditor editor={editor} label="New value of status" actions={sut} />
    </div>,
  )
  return sut
}

describe('the editor of an enum', () => {
  it('should list the values with the focus on the list, the value of the cell chosen', () => {
    choiceEditor('paid', false)

    const list = screen.getByRole('listbox', { name: 'New value of status' })
    expect(document.activeElement).toBe(list)
    expect(
      screen.getAllByRole('option').map((option) => [option.textContent, option.ariaSelected]),
    ).toStrictEqual([
      ['open', 'false'],
      ['(empty)', 'false'],
      ['paid', 'true'],
    ])
  })

  it('should move along the values with the arrows, staying inside them', () => {
    const sut = choiceEditor('paid', false)
    const list = screen.getByRole('listbox')

    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })

    expect(sut.change.mock.calls).toStrictEqual([[''], ['paid']])
  })

  it('should start from the first value when the cell holds none of them', () => {
    const sut = choiceEditor('closed', false)

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })

    expect(sut.change).toHaveBeenCalledWith('open')
  })

  it('should put the value in with Enter or a click, and leave the cell with Escape', () => {
    const sut = choiceEditor('paid', false)
    const list = screen.getByRole('listbox')

    fireEvent.keyDown(list, { key: 'Enter' })
    fireEvent.click(screen.getByRole('option', { name: 'open' }))
    fireEvent.keyDown(list, { key: 'Escape' })
    fireEvent.mouseDown(list)

    expect(sut.commit).toHaveBeenCalledWith(EditorExit.Stay)
    expect(sut.put).toHaveBeenCalledWith('open', EditorExit.Stay)
    expect(sut.cancel).toHaveBeenCalledOnce()
  })
})

describe('the editor of a set', () => {
  it('should check the values the cell holds, the first one with the focus', () => {
    choiceEditor('paid', true)

    const boxes = screen.getAllByRole<HTMLInputElement>('checkbox')
    expect(boxes.map((box) => box.checked)).toStrictEqual([false, false, true])
    expect(document.activeElement).toBe(boxes[0])
    expect(screen.getByRole('group', { name: 'New value of status' })).toBeDefined()
  })

  it('should write the values checked in the order of the column', () => {
    const sut = choiceEditor('paid', true)

    fireEvent.click(screen.getByRole('checkbox', { name: 'open' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'paid' }))

    expect(sut.change.mock.calls).toStrictEqual([['open,paid'], ['']])
  })

  it('should put the values in with OK or Enter', () => {
    const sut = choiceEditor('', true)

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'open' }), { key: 'Enter' })
    fireEvent.mouseDown(screen.getByRole('group'))

    expect(sut.commit.mock.calls).toStrictEqual([[EditorExit.Stay], [EditorExit.Stay]])
  })
})
