import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IconName } from './icons.tsx'
import { MenuButton, type MenuItem } from './Menu.tsx'

function menu(items: readonly MenuItem[], { hasChevron = true } = {}): HTMLButtonElement {
  render(
    <>
      <MenuButton
        label="Copy"
        icon={IconName.Copy}
        items={items}
        isDisabled={false}
        hasChevron={hasChevron}
      />
      <p>elsewhere</p>
    </>,
  )
  return screen.getByRole<HTMLButtonElement>('button', { name: 'Copy' })
}

function item(label: string, isDisabled = false): MenuItem {
  return { label, isDisabled, onSelect: vi.fn() }
}

function focused(): string | null | undefined {
  return document.activeElement?.textContent
}

describe('MenuButton', () => {
  it('should open its menu under it, the focus on the first item that can be picked', () => {
    const sut = menu([item('CSV', true), item('JSON'), item('SQL')])
    expect(sut).toMatchObject({ title: 'Copy', className: 'tool-button has-chevron' })
    expect(sut.getAttribute('aria-haspopup')).toBe('menu')

    fireEvent.click(sut)

    expect(sut.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu', { name: 'Copy' }).getAttribute('style')).toBe(
      'top: 2px; left: 0px;',
    )
    expect(focused()).toBe('JSON')
  })

  it('should move along its items with the arrow keys, wrapping around, and to its ends', () => {
    menu([item('CSV'), item('JSON', true), item('SQL'), item('TSV')])
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    const list = screen.getByRole('menu')

    const visited = ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home', 'x'].map(
      (key) => {
        fireEvent.keyDown(list, { key })
        return focused()
      },
    )

    expect(visited).toStrictEqual(['SQL', 'TSV', 'CSV', 'TSV', 'TSV', 'CSV', 'CSV'])
  })

  it('should pick an item, closing the menu and giving the focus back to its button', () => {
    const json = item('JSON')
    const sut = menu([item('CSV'), json])
    fireEvent.click(sut)

    fireEvent.click(screen.getByRole('menuitem', { name: 'JSON' }))

    expect(json.onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(sut)
  })

  it.each(['Escape', 'Tab'])('should close with %s, giving the focus back to its button', (key) => {
    const sut = menu([item('CSV')])
    fireEvent.click(sut)

    fireEvent.keyDown(screen.getByRole('menu'), { key })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(sut)
  })

  it('should close when its button is clicked again, or something else is', () => {
    const sut = menu([item('CSV')], { hasChevron: false })
    expect(sut.className).toBe('header-action')

    fireEvent.click(sut)
    fireEvent.mouseDown(sut)
    fireEvent.click(sut)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(sut)
    fireEvent.mouseDown(screen.getByText('elsewhere'))

    expect(screen.queryByRole('menu')).toBeNull()
    expect(sut.getAttribute('aria-expanded')).toBe('false')
  })
})
