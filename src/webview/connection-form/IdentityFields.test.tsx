import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import { click, openForm, textField, typeIn } from '../../../test/webview/connection-form.ts'

const SAVED = { mode: 'edit', connection: VALID_CONNECTION, heldSecrets: ['password'] } as const

function swatch(name: string): HTMLElement {
  return screen.getByRole('radio', { name })
}

function savedConnection(sent: ReturnType<typeof openForm>['sent']): unknown {
  click('Save connection')
  const [save] = sent('save')
  return save !== undefined && 'draft' in save ? save.draft.connection : undefined
}

describe('the color of a connection', () => {
  it('should offer no color and the colors of the theme as swatches', () => {
    openForm()

    const group = screen.getByRole('radiogroup', { name: 'Color' })
    const swatches = [...group.querySelectorAll<HTMLElement>('[role="radio"]')]
    expect(swatches.map((each) => each.getAttribute('aria-label'))).toStrictEqual([
      'No color',
      'Red',
      'Orange',
      'Yellow',
      'Green',
      'Blue',
      'Purple',
    ])
    expect(swatches.map((each) => each.style.backgroundColor)).toStrictEqual([
      '',
      'var(--vscode-charts-red)',
      'var(--vscode-charts-orange)',
      'var(--vscode-charts-yellow)',
      'var(--vscode-charts-green)',
      'var(--vscode-charts-blue)',
      'var(--vscode-charts-purple)',
    ])
    expect(swatch('No color').getAttribute('aria-checked')).toBe('true')
    expect(swatch('No color').className).toBe('swatch swatch-none')
    expect(swatch('No color').tabIndex).toBe(0)
    expect(swatch('Red').tabIndex).toBe(-1)
  })

  it('should take the color clicked or reached with the arrow keys', () => {
    const { sent } = openForm(SAVED)
    const group = screen.getByRole('radiogroup', { name: 'Color' })

    click('Green', 'radio')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(swatch('Blue'))
    fireEvent.keyDown(group, { key: 'a' })

    expect(swatch('Blue').getAttribute('aria-checked')).toBe('true')
    expect(savedConnection(sent)).toMatchObject({ color: 'blue' })
  })
})

describe('the folder of a connection', () => {
  it('should save the folder typed', () => {
    const { sent } = openForm(SAVED)

    typeIn(textField('Folder'), 'clients/acme')

    expect(savedConnection(sent)).toMatchObject({ folder: 'clients/acme' })
  })
})
