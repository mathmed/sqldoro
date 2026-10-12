import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { type FakeVsCodeApi, fakeVsCodeApi } from '../../test/webview/vscode-api.ts'
import type { Crumb } from '../core/navigation/history.ts'
import type { PanelConnection } from '../core/results/protocol-parts.ts'
import { PanelHeader } from './PanelHeader.tsx'
import { useTrailKeys } from './use-trail-keys.ts'

const LOCKED: PanelConnection = {
  name: 'Shop',
  environment: '',
  isProduction: false,
  isReadOnly: true,
  color: 'charts.green',
}

const Header = ({
  connection,
  crumbs,
  api,
}: {
  readonly connection: PanelConnection | null
  readonly crumbs: readonly Crumb[]
  readonly api: FakeVsCodeApi
}): ReactElement => {
  useTrailKeys(api, crumbs)
  return <PanelHeader api={api} connection={connection} crumbs={crumbs} />
}

describe('PanelHeader', () => {
  it('should show nothing without a connection or a trail', () => {
    const { container } = render(
      <PanelHeader api={fakeVsCodeApi()} connection={null} crumbs={[]} />,
    )

    expect(container.textContent).toBe('')
  })

  it('should show the dot of the color of the connection', () => {
    render(<PanelHeader api={fakeVsCodeApi()} connection={LOCKED} crumbs={[]} />)

    expect(
      screen.getByRole('note', { name: 'Connection' }).querySelector<HTMLElement>('.connection-dot')
        ?.style.backgroundColor,
    ).toBe('var(--vscode-charts-green)')
  })

  it('should open and close the note of a read-only connection from its lock', () => {
    render(<PanelHeader api={fakeVsCodeApi()} connection={LOCKED} crumbs={[]} />)
    const lock = screen.getByRole('button', { name: 'Read-only' })

    fireEvent.click(lock)
    expect(lock.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(lock)

    expect(lock.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Allow Writes…' })).toBeNull()
  })

  it('should go nowhere along a trail that shows none of its steps', () => {
    const api = fakeVsCodeApi()
    const crumbs = [
      { id: 1, label: 'orders', isCurrent: false, isQuery: false },
      { id: 2, label: 'lines', isCurrent: false, isQuery: false },
    ]
    render(<Header api={api} connection={null} crumbs={crumbs} />)

    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })

    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Forward' })).toHaveProperty('disabled', true)
    expect(api.posted()).toStrictEqual([])
  })
})
