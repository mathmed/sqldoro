import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import type { ExportFormat } from '../core/results/export-format.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { Toolbar } from './Toolbar.tsx'

let actions: {
  cancel: Mock<() => void>
  loadAll: Mock<() => void>
  refresh: Mock<() => void>
  copy: Mock<(format: ExportFormat) => void>
  copyRows: Mock<() => void>
  export: Mock<(format: ExportFormat) => void>
  setServerSide: Mock<(isServerSide: boolean) => void>
}

function toolbar(
  changes: Partial<ResultTab> = {},
  hasSelection = true,
  isServerSide = false,
): void {
  render(
    <Toolbar
      tab={resultTab(changes)}
      hasSelection={hasSelection}
      isServerSide={isServerSide}
      actions={actions}
    />,
  )
}

function button(group: string, name: string): HTMLButtonElement {
  const buttons = screen.getByRole('group', { name: group }).querySelectorAll('button')
  const found = [...buttons].find((candidate) => candidate.textContent === name)
  if (found === undefined) {
    throw new Error(`no ${name} in ${group}`)
  }
  return found
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
  }
})

describe('Toolbar', () => {
  it('should copy the selection and export the result in each format', () => {
    toolbar()

    fireEvent.click(button('Copy selection as', 'INSERT'))
    fireEvent.click(button('Export as', 'CSV'))
    fireEvent.click(button('Export as', 'JSON'))

    expect(actions.copy).toHaveBeenCalledWith('sql')
    expect(actions.export.mock.calls).toStrictEqual([['csv'], ['json']])
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('should not copy without a selection nor export a result without columns', () => {
    toolbar({ columns: [] }, false)

    expect(button('Copy selection as', 'CSV').disabled).toBe(true)
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Copy Rows as INSERT' }).disabled,
    ).toBe(true)
    expect(button('Export as', 'SQL').disabled).toBe(true)
  })

  it('should copy the selected rows whole as INSERT statements', () => {
    toolbar()

    fireEvent.click(screen.getByRole('button', { name: 'Copy Rows as INSERT' }))

    expect(actions.copyRows).toHaveBeenCalledOnce()
    expect(actions.copy).not.toHaveBeenCalled()
  })

  it('should cancel a statement that runs, and not export it yet', () => {
    toolbar({ status: 'running' })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(actions.cancel).toHaveBeenCalledOnce()
    expect(button('Export as', 'CSV').disabled).toBe(true)
    expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(true)
  })

  it('should switch the sort and filters to the server where the statement allows it', () => {
    toolbar({}, true, true)

    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Sort and filter on the server',
    })
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)

    expect(actions.setServerSide).toHaveBeenCalledWith(false)
  })

  it('should offer to load every row only when the automatic limit cut the result', () => {
    const limited = { durationMs: 1, affectedRows: null, isTruncated: true, autoLimit: 500 }
    toolbar({ summary: limited })
    fireEvent.click(screen.getByRole('button', { name: 'Load All Rows' }))
    expect(actions.loadAll).toHaveBeenCalledOnce()
  })

  it('should not offer to load every row of a complete result', () => {
    toolbar()

    expect(screen.queryByRole('button', { name: 'Load All Rows' })).toBeNull()
  })

  it('should read the rows of a table again once they are read', () => {
    toolbar({ canRefresh: true })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(actions.refresh).toHaveBeenCalledOnce()
  })

  it('should not offer to read the rows of a table again while they are read', () => {
    toolbar({ canRefresh: true, status: 'running' })

    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('should not offer to read the rows of a query again', () => {
    toolbar()

    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('should not offer the server where the statement cannot run again', () => {
    toolbar({ canServerView: false })

    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
