import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { editableTab, resultTab } from '../../test/fixtures/results.ts'
import { isOff, pickFromMenu } from '../../test/webview/grid.ts'
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

// The accessible name and the tooltip of every button of the toolbar, but those of the WHERE
// and of the quick search.
function tooltips(): (readonly [string | null, string])[] {
  return within(screen.getByRole('toolbar', { name: 'Result actions' }))
    .getAllByRole('button')
    .filter((element) => element.classList.contains('tool-button') || isMore(element))
    .map((element) => [element.getAttribute('aria-label'), element.title] as const)
}

function isMore(element: HTMLElement): boolean {
  return element.getAttribute('aria-label') === 'More Actions'
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
      title: 'Refresh',
      textContent: '',
    })
    expect(button('Preview Changes… (Ctrl+S)').title).toBe(
      'Preview Changes… (Ctrl+S): there are no changes',
    )
  })

  it('should name every button with its tooltip, saying why it is off and what it shows', () => {
    toolbar(editableTab({}, { canRefresh: true, queryBox: { sql: 'SELECT 1', isCustom: false } }), {
      hasSelection: false,
    })

    expect(tooltips()).toStrictEqual([
      ['Refresh', 'Refresh'],
      ['Preview Changes… (Ctrl+S)', 'Preview Changes… (Ctrl+S): there are no changes'],
      ['Revert All Changes', 'Revert All Changes: there are no changes'],
      ['Add Row', 'Add Row'],
      ['Duplicate Rows', 'Duplicate Rows: select rows first'],
      ['Delete Rows (Delete)', 'Delete Rows (Delete): select rows first'],
      ['Set to NULL', 'Set to NULL: select cells first'],
      ['Set to Default', 'Set to Default: select cells first'],
      ['Revert Cells', 'Revert Cells: select cells first'],
      ['Copy Selection', 'Copy Selection: select cells to copy them'],
      ['Export Result', 'Export Result: the columns shown, in their order'],
      ['Choose Columns', 'Choose Columns'],
      [
        'Edit the Query (Ctrl+Shift+E)',
        'Edit the Query (Ctrl+Shift+E): the whole query of this table, above the rows',
      ],
      ['More Actions', 'More Actions'],
    ])
  })

  it('should name the buttons of a limited result and of a statement that runs', () => {
    const limited = { durationMs: 1, affectedRows: null, isTruncated: true, autoLimit: 500 }
    toolbar(resultTab({ summary: limited }))
    expect(tooltips().slice(-2)).toStrictEqual([
      ['Load All Rows', 'Load All Rows: run the query again without the automatic limit'],
      ['Sort and Filter on the Server', 'Sort and Filter on the Server: off'],
    ])
    cleanup()

    toolbar(resultTab({ status: 'running', summary: null }), { isServerSide: true })
    expect(tooltips()).toContainEqual(['Cancel Query', 'Cancel Query'])
    expect(tooltips()).toContainEqual([
      'Export Result',
      'Export Result: the query is still running',
    ])
    expect(tooltips()).toContainEqual([
      'Sort and Filter on the Server',
      'Sort and Filter on the Server: on',
    ])
  })

  it('should keep the buttons that are off hoverable, and do nothing on their click', () => {
    toolbar(editableTab({}), { hasSelection: false })

    for (const name of ['Preview Changes… (Ctrl+S)', 'Copy Selection', 'Delete Rows (Delete)']) {
      expect(button(name)).toMatchObject({ disabled: false })
      expect(isOff(button(name))).toBe(true)
      fireEvent.click(button(name))
    }

    expect(EDITS.preview).not.toHaveBeenCalled()
    expect(EDITS.onSelection).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('should copy the selection in each format, and its rows whole as INSERT statements', () => {
    toolbar(resultTab())

    pickFromMenu('Copy Selection', 'Copy as CSV')
    pickFromMenu('Copy Selection', 'Copy as JSON')
    pickFromMenu('Copy Selection', 'Copy as INSERT')
    pickFromMenu('Copy Selection', 'Copy Rows as INSERT (every column)')

    expect(actions.copy.mock.calls).toStrictEqual([['csv'], ['json'], ['sql']])
    expect(actions.copyRows).toHaveBeenCalledOnce()
  })

  it('should export the result in each format', () => {
    toolbar(resultTab())

    pickFromMenu('Export Result', 'Export as CSV…')
    pickFromMenu('Export Result', 'Export as JSON…')
    pickFromMenu('Export Result', 'Export as SQL…')

    expect(actions.export.mock.calls).toStrictEqual([['csv'], ['json'], ['sql']])
  })

  it('should not copy without a selection nor export a result without columns', () => {
    toolbar(resultTab({ columns: [] }), { hasSelection: false })

    expect(isOff(button('Copy Selection'))).toBe(true)
    expect(isOff(button('Export Result'))).toBe(true)
    expect(button('Export Result').title).toBe('Export Result: the result has no columns yet')
  })

  it('should cancel a statement that runs, and not export it nor switch to the server yet', () => {
    toolbar(resultTab({ status: 'running', summary: null }))

    fireEvent.click(button('Cancel Query'))
    fireEvent.click(button('Sort and Filter on the Server'))

    expect(actions.cancel).toHaveBeenCalledOnce()
    expect(groups().at(0)).toBe('Run')
    expect(isOff(button('Export Result'))).toBe(true)
    expect(isOff(button('Sort and Filter on the Server'))).toBe(true)
    expect(actions.setServerSide).not.toHaveBeenCalled()
  })

  it('should switch the sort and filters to the server, pressed while they are there', () => {
    toolbar(resultTab(), { isServerSide: true })

    const toggle = button('Sort and Filter on the Server')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)

    expect(actions.setServerSide).toHaveBeenCalledWith(false)
  })

  it('should offer to load every row only when the automatic limit cut the result', () => {
    const limited = { durationMs: 1, affectedRows: null, isTruncated: true, autoLimit: 500 }
    toolbar(resultTab({ summary: limited, canServerView: false }))

    fireEvent.click(button('Load All Rows'))

    expect(actions.loadAll).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Sort and Filter on the Server' })).toBeNull()
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

    expect(screen.queryByRole('button', { name: 'Sort and Filter on the Server' })).toBeNull()
  })

  it('should show the query box of a table panel from its WHERE, which it then replaces', () => {
    toolbar(resultTab({ canRefresh: true }))

    fireEvent.click(button('Edit the Query (Ctrl+Shift+E)'))

    expect(queryMode.toggle).toHaveBeenCalledOnce()
    expect(button('Edit the Query (Ctrl+Shift+E)').title).toBe(
      'Edit the Query (Ctrl+Shift+E): the whole query of this table, above the rows',
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

    expect(button('Copy Selection').title).toBe('Copy Selection: the columns shown, in their order')
    expect(button('Export Result').title).toBe('Export Result: the columns shown, in their order')
  })

  it('should open the columns, saying how many are hidden', () => {
    panels = { ...panels, hiddenColumns: 2 }
    toolbar(resultTab())

    const columns = button('Choose Columns')
    fireEvent.click(columns)

    expect(columns.title).toBe('Choose Columns: 2 hidden')
    expect(panels.openColumns).toHaveBeenCalledWith(columns)
  })

  it('should open the rows that reference the selected row, once a row is selected', () => {
    const tab = resultTab({ references: [{ label: 'orders (customer_id)' }] })
    toolbar(tab)
    expect(isOff(button('Show References'))).toBe(true)
    expect(button('Show References').title).toBe(
      'Show References: select a row to see the rows of other tables that reference it',
    )
    cleanup()

    panels = { ...panels, openReferences: vi.fn() }
    toolbar(tab)
    fireEvent.click(button('Show References'))

    expect(button('Choose Columns').title).toBe('Choose Columns')
    expect(isOff(button('Show References'))).toBe(false)
    expect(button('Show References').title).toBe('Show References')
    expect(panels.openReferences).toHaveBeenCalledWith(button('Show References'))
  })

  it('should not offer the columns of a plan or of a failed statement', () => {
    toolbar(resultTab({ kind: 'plan' }))
    expect(screen.queryByRole('button', { name: 'Choose Columns' })).toBeNull()
    cleanup()

    toolbar(resultTab({ status: 'failed' }))
    expect(screen.queryByRole('button', { name: 'Choose Columns' })).toBeNull()
  })

  it('should search the rows of every result', () => {
    toolbar(resultTab())

    const search = screen.getByRole('searchbox', { name: 'Quick Search' })
    fireEvent.change(search, { target: { value: 'ann' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(actions.search).toHaveBeenCalledExactlyOnceWith('ann')
  })
})
