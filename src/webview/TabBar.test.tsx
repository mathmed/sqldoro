import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import { TabBar } from './TabBar.tsx'

const TABS = [
  resultTab({ id: 'a', title: 'SELECT 1', status: 'succeeded' }),
  resultTab({ id: 'b', title: 'SELECT 2', status: 'running' }),
  resultTab({ id: 'c', title: 'SELECT 3', status: 'failed' }),
]

describe('TabBar', () => {
  it('should show one tab per statement, numbered, with its status', () => {
    render(<TabBar tabs={TABS} activeTabId="b" onActivate={vi.fn()} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toStrictEqual([
      '1. SELECT 1',
      '2. SELECT 2',
      '3. SELECT 3',
    ])
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toStrictEqual([
      'false',
      'true',
      'false',
    ])
    expect(tabs.map((tab) => tab.tabIndex)).toStrictEqual([-1, 0, -1])
    expect(
      screen.getAllByRole('img').map((status) => status.getAttribute('aria-label')),
    ).toStrictEqual(['done', 'running', 'failed'])
    expect(tabs[0]?.getAttribute('title')).toBe('SELECT * FROM orders')
  })

  it('should bring a tab to the front on click', () => {
    const onActivate = vi.fn()
    render(<TabBar tabs={TABS} activeTabId="a" onActivate={onActivate} />)

    fireEvent.click(screen.getByText('3. SELECT 3'))

    expect(onActivate).toHaveBeenCalledWith('c')
  })

  it('should move along the tabs with the arrow keys, wrapping around', () => {
    const onActivate = vi.fn()
    render(<TabBar tabs={TABS} activeTabId="a" onActivate={onActivate} />)
    const list = screen.getByRole('tablist')

    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    fireEvent.keyDown(list, { key: 'Enter' })

    expect(onActivate.mock.calls).toStrictEqual([['c'], ['b']])
  })

  it('should show a cancelled status', () => {
    render(
      <TabBar
        tabs={[resultTab({ status: 'cancelled' })]}
        activeTabId={null}
        onActivate={vi.fn()}
      />,
    )

    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('cancelled')
  })
})
