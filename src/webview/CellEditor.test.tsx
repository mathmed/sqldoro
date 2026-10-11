import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ValueType } from '../core/engine/table.ts'
import { CellEditor } from './CellEditor.tsx'
import { type CellEditorActions, EditorExit } from './editor-keys.ts'
import type { CellEditorView } from './use-cell-editor.ts'

const EDITOR: CellEditorView = {
  position: { row: 2, column: 1 },
  spec: { type: ValueType.Text, maxLength: 10 },
  text: 'ann',
  problem: '',
}

function editorActions(): CellEditorActions {
  return { change: vi.fn(), commit: vi.fn(), put: vi.fn(), cancel: vi.fn() }
}

function renderEditor(
  changes: Partial<CellEditorView> = {},
  sut = editorActions(),
): { readonly sut: CellEditorActions; readonly input: HTMLElement } {
  render(<CellEditor editor={{ ...EDITOR, ...changes }} label="New value of name" actions={sut} />)
  return { sut, input: screen.getByRole('textbox', { name: 'New value of name' }) }
}

describe('CellEditor', () => {
  it('should show the value with the focus, and say what is typed', () => {
    const { sut, input } = renderEditor()

    expect(input).toHaveProperty('value', 'ann')
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(input.hasAttribute('aria-describedby')).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.change(input, { target: { value: 'bob' } })
    expect(sut.change).toHaveBeenCalledWith('bob')
  })

  it('should say why the column cannot hold what was typed', () => {
    const { input } = renderEditor({ problem: 'Too long.' })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Too long.')
    expect(alert.id).toBe('editor-problem-2-1')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('editor-problem-2-1')
  })

  it('should wait for the whole value of a cut cell', () => {
    render(
      <CellEditor editor={{ ...EDITOR, text: undefined }} label="name" actions={editorActions()} />,
    )

    expect(screen.getByText('Loading…')).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it.each([
    { key: 'Enter', modifiers: {}, exit: EditorExit.Stay },
    { key: 'Tab', modifiers: {}, exit: EditorExit.Next },
    { key: 'Tab', modifiers: { shiftKey: true }, exit: EditorExit.Previous },
  ])('should put the value in with $key $modifiers', ({ key, modifiers, exit }) => {
    const { sut, input } = renderEditor()

    const isNotPrevented = fireEvent.keyDown(input, { key, ...modifiers })

    expect(sut.commit).toHaveBeenCalledWith(exit)
    expect(sut.cancel).not.toHaveBeenCalled()
    expect(isNotPrevented).toBe(false)
  })

  it('should leave the cell as it was with Escape', () => {
    const { sut, input } = renderEditor()

    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(false)

    expect(sut.cancel).toHaveBeenCalledOnce()
    expect(sut.commit).not.toHaveBeenCalled()
  })

  it.each([
    { key: 'Enter', shiftKey: true },
    { key: 'Enter', altKey: true },
    { key: 'a' },
    { key: 'ArrowLeft' },
  ])('should leave $key to the text box', (keys) => {
    const { sut, input } = renderEditor()

    expect(fireEvent.keyDown(input, keys)).toBe(true)

    expect(sut.commit).not.toHaveBeenCalled()
    expect(sut.cancel).not.toHaveBeenCalled()
  })

  it('should keep the clicks in the text box from the grid', () => {
    const onMouseDown = vi.fn()
    render(
      <div onMouseDown={onMouseDown}>
        <CellEditor editor={EDITOR} label="name" actions={editorActions()} />
      </div>,
    )

    fireEvent.mouseDown(screen.getByRole('textbox'))

    expect(onMouseDown).not.toHaveBeenCalled()
  })
})
