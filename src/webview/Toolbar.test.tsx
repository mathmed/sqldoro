import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { editableTab, resultTab } from '../../test/fixtures/results.ts'
import { pickFromMenu } from '../../test/webview/grid.ts'
import type { ExportFormat } from '../core/results/export-format.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import type { EditActions } from './edit-messages.ts'
import { Toolbar } from './Toolbar.tsx'

let actions: {
  cancel: Mock<() => void>
  loadAll: Mock<() => void>
  refresh: Mock<() => void>
  copy: Mock<(format: ExportFormat) => void>
  copyRows: Mock<() => void>
  export: Mock<(format: ExportFormat) => void>
  setServerSide: Mock<(isServerSide: boolean) => void>
  search: Mock<(text: string) => void>
  filterTable: Mock<(condition: string) => void>
}

const EDITS: EditActions = {
  onSelection: vi.fn(),
  onResult: vi.fn(),
  preview: vi.fn(),
  closePreview: vi.fn(),
  apply: vi.fn(),
}

function toolbar(tab: ResultTab, { hasSelection = true, isServerSide = false } = {}): void {
  render(
    <Toolbar
      tab={tab}
      hasSelection={hasSelection}
      isServerSide={isServerSide}
      actions={actions}
      edits={EDITS}
    />,
  )
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name })
}

function groups(): (string | null)[] {
  return within(screen.getByRole('toolbar', { name: 'Result actions' }))
    .getAllByRole('group')
    .map((group) => group.getAttribute('aria-label'))
}

beforeEach(() => {
  actions = {
    cancel: vi.fn(),
    loadAll: vi.fn(),
    refresh: vi.fn(),
    copy: vi.fn(),
    copyRows: vi.fn(),
    export: vi.fn(),
    setServerSide: vi.fn(),
    search: vi.fn(),
    filterTable: vi.fn(),
  }
})

describe('Toolbar', () => {
  it('should group compact icon buttons, each named and with a tooltip', () => {
    toolbar(editableTab({}, { canRefresh: true }))

    expect(groups()).toStrictEqual([
      'Run',
      'Changes',
      'Rows',
      'Cells',
      'Copy and export',
      'Reading',
    ])
    expect(button('Refresh')).toMatchObject({
      className: 'tool-button',
      title: 'Read the rows again, in the same view',
      textContent: '',
    })
    expect(button('Preview Changes…').title).toBe(
      'Preview the statements of the changes, then apply them (Ctrl+S)',
    )
  })

  it('should copy the selection in each format, and its rows whole as INSERT statements', () => {
    toolbar(resultTab())

    pickFromMenu('Copy the selection', 'Copy as CSV')
    pickFromMenu('Copy the selection', 'Copy as JSON')
    pickFromMenu('Copy the selection', 'Copy as INSERT')
    pickFromMenu('Copy the selection', 'Copy Rows as INSERT')

    expect(actions.copy.mock.calls).toStrictEqual([['csv'], ['json'], ['sql']])
    expect(actions.copyRows).toHaveBeenCalledOnce()
  })

  it('should export the result in each format', () => {
    toolbar(resultTab())

    pickFromMenu('Export the result', 'Export as CSV…')
    pickFromMenu('Export the result', 'Export as JSON…')
    pickFromMenu('Export the result', 'Export as SQL…')

    expect(actions.export.mock.calls).toStrictEqual([['csv'], ['json'], ['sql']])
  })

  it('should not copy without a selection nor export a result without columns', () => {
    toolbar(resultTab({ columns: [] }), { hasSelection: false })

    expect(button('Copy the selection').disabled).toBe(true)
    expect(button('Export the result').disabled).toBe(true)
  })

  it('should cancel a statement that runs, and not export it nor switch to the server yet', () => {
    toolbar(resultTab({ status: 'running', summary: null }))

    fireEvent.click(button('Cancel'))

    expect(actions.cancel).toHaveBeenCalledOnce()
    expect(groups().at(0)).toBe('Run')
    expect(button('Export the result').disabled).toBe(true)
    expect(button('Sort and filter on the server').disabled).toBe(true)
  })

  it('should switch the sort and filters to the server, pressed while they are there', () => {
    toolbar(resultTab(), { isServerSide: true })

    const toggle = button('Sort and filter on the server')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)

    expect(actions.setServerSide).toHaveBeenCalledWith(false)
  })

  it('should offer to load every row only when the automatic limit cut the result', () => {
    const limited = { durationMs: 1, affectedRows: null, isTruncated: true, autoLimit: 500 }
    toolbar(resultTab({ summary: limited, canServerView: false }))

    fireEvent.click(button('Load All Rows'))

    expect(actions.loadAll).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Sort and filter on the server' })).toBeNull()
  })

  it('should leave out what a complete result that cannot run again has no use for', () => {
    toolbar(resultTab({ canServerView: false }))

    expect(groups()).toStrictEqual(['Copy and export'])
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'WHERE condition' })).toBeNull()
  })

  it('should read the rows of a table again, and offer its WHERE', () => {
    toolbar(resultTab({ canRefresh: true }))

    fireEvent.click(button('Refresh'))

    expect(actions.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'WHERE condition' })).toBeDefined()
  })

  it('should search the rows of every result', () => {
    toolbar(resultTab())

    const search = screen.getByRole('searchbox', { name: 'Quick Search' })
    fireEvent.change(search, { target: { value: 'ann' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(actions.search).toHaveBeenCalledExactlyOnceWith('ann')
  })
})
