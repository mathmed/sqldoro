import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { editableTab, resultTab } from '../../test/fixtures/results.ts'
import { pickFromMenu } from '../../test/webview/grid.ts'
import type { ExportFormat } from '../core/results/export-format.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import type { EditActions } from './edit-messages.ts'
import { Toolbar } from './Toolbar.tsx'
import { type WhereSql, whereSql } from './where-source.ts'

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
  openInEditor: Mock<() => void>
}

let queryMode: { isOn: boolean; toggle: Mock<() => void> }
let panels: {
  openColumns: Mock<(anchor: HTMLElement) => void>
  openReferences: Mock<(anchor: HTMLElement) => void> | undefined
  hiddenColumns: number
  whereSql: WhereSql
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
      panels={panels}
      queryMode={queryMode}
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
    openInEditor: vi.fn(),
  }
  queryMode = { isOn: false, toggle: vi.fn() }
  panels = {
    openColumns: vi.fn(),
    openReferences: undefined,
    hiddenColumns: 0,
    whereSql: whereSql(resultTab(), null),
  }
})

describe('Toolbar', () => {
  it('should group compact icon buttons, each named and with a tooltip', () => {
    toolbar(editableTab({}, { canRefresh: true }))

    expect(groups()).toStrictEqual(['Run', 'Changes', 'Rows', 'Cells', 'Copy and export', 'View'])
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
    pickFromMenu('Copy the selection', 'Copy Rows as INSERT (every column)')

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

    expect(groups()).toStrictEqual(['Copy and export', 'View'])
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'WHERE condition' })).toBeNull()
  })

  it('should read the rows of a table again, and offer its WHERE', () => {
    toolbar(resultTab({ canRefresh: true }))

    fireEvent.click(button('Refresh'))

    expect(actions.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('combobox', { name: 'WHERE condition' })).toBeDefined()
  })

  it('should always sort and filter the rows of a table on the server, with no switch', () => {
    toolbar(resultTab({ canRefresh: true, canServerView: true }))

    expect(screen.queryByRole('button', { name: 'Sort and filter on the server' })).toBeNull()
  })

  it('should show the query box of a table panel from its WHERE, which it then replaces', () => {
    toolbar(resultTab({ canRefresh: true }))

    fireEvent.click(button('Edit the Query'))

    expect(queryMode.toggle).toHaveBeenCalledOnce()
    expect(button('Edit the Query').title).toBe(
      'Edit the whole query of this table above the rows (Ctrl+Shift+E)',
    )
  })

  it('should leave the WHERE out while the query box is shown', () => {
    queryMode = { isOn: true, toggle: vi.fn() }

    toolbar(resultTab({ canRefresh: true }))

    expect(screen.queryByRole('combobox', { name: 'WHERE condition' })).toBeNull()
  })

  it('should open the query of a table panel in an SQL editor from its other actions', () => {
    toolbar(resultTab({ canRefresh: true, queryBox: { sql: 'SELECT 1', isCustom: false } }))

    fireEvent.click(button('More Actions'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in SQL Editor' }))

    expect(actions.openInEditor).toHaveBeenCalledOnce()
  })

  it('should have no other actions outside a table panel', () => {
    toolbar(resultTab())

    expect(screen.queryByRole('button', { name: 'More Actions' })).toBeNull()
  })

  it('should say that copying and exporting take the columns shown, in their order', () => {
    toolbar(resultTab())

    expect(button('Copy the selection').title).toBe(
      'Copy the selection: the columns shown, in their order',
    )
    expect(button('Export the result').title).toBe(
      'Export the result: the columns shown, in their order',
    )
  })

  it('should open the columns, saying how many are hidden', () => {
    panels = { ...panels, hiddenColumns: 2 }
    toolbar(resultTab())

    const columns = button('Columns')
    fireEvent.click(columns)

    expect(columns.title).toBe('Choose the columns shown and their order (2 hidden)')
    expect(panels.openColumns).toHaveBeenCalledWith(columns)
  })

  it('should open the rows that reference the selected row, once a row is selected', () => {
    const tab = resultTab({ references: [{ label: 'orders (customer_id)' }] })
    toolbar(tab)
    expect(button('References')).toMatchObject({
      disabled: true,
      title: 'Select a row to see the rows of other tables that reference it',
    })
    cleanup()

    panels = { ...panels, openReferences: vi.fn() }
    toolbar(tab)
    fireEvent.click(button('References'))

    expect(button('Columns').title).toBe('Choose the columns shown and their order')
    expect(button('References').title).toBe(
      'The rows of other tables that reference the selected row',
    )
    expect(panels.openReferences).toHaveBeenCalledWith(button('References'))
  })

  it('should not offer the columns of a plan or of a failed statement', () => {
    toolbar(resultTab({ kind: 'plan' }))
    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull()
    cleanup()

    toolbar(resultTab({ status: 'failed' }))
    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull()
  })

  it('should search the rows of every result', () => {
    toolbar(resultTab())

    const search = screen.getByRole('searchbox', { name: 'Quick Search' })
    fireEvent.change(search, { target: { value: 'ann' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(actions.search).toHaveBeenCalledExactlyOnceWith('ann')
  })
})
