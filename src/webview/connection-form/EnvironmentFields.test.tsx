import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { click, openForm, press } from '../../../test/webview/connection-form.ts'

function segment(name: string): HTMLElement {
  return screen.getByRole('radio', { name })
}

function readOnly(): HTMLElement {
  return screen.getByRole('switch', { name: 'Read-only' })
}

describe('the environment', () => {
  it('should offer every environment side by side, each with the dot of its color', () => {
    openForm()

    const group = screen.getByRole('radiogroup', { name: 'Environment' })
    const segments = [...group.querySelectorAll('[role="radio"]')]
    expect(segments.map((radio) => radio.textContent)).toStrictEqual([
      'None',
      'Local',
      'Dev',
      'Staging',
      'Prod',
    ])
    expect(
      segments.map(
        (radio) => radio.querySelector<HTMLElement>('.environment-dot')?.style.backgroundColor,
      ),
    ).toStrictEqual([
      '',
      'var(--vscode-charts-green)',
      'var(--vscode-charts-blue)',
      'var(--vscode-charts-orange)',
      'var(--vscode-charts-red)',
    ])
    expect(segment('None').getAttribute('aria-checked')).toBe('true')
    expect(segment('None').tabIndex).toBe(0)
    expect(segment('Prod').tabIndex).toBe(-1)
  })

  it('should make the connection read-only when it is tagged as production', () => {
    openForm()

    click('Read-only', 'switch')
    expect(readOnly()).toHaveProperty('checked', false)
    click('Prod', 'radio')

    expect(segment('Prod').getAttribute('aria-checked')).toBe('true')
    expect(segment('None').getAttribute('aria-checked')).toBe('false')
    expect(readOnly()).toHaveProperty('checked', true)
    click('Read-only', 'switch')
    click('Dev', 'radio')
    expect(readOnly()).toHaveProperty('checked', false)
  })

  it('should move along the environments with the arrow keys, round the ends', () => {
    openForm()
    const group = screen.getByRole('radiogroup', { name: 'Environment' })

    press(group, 'ArrowLeft')
    expect(segment('Prod').getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(segment('Prod'))
    press(group, 'ArrowRight')
    press(group, 'ArrowDown')
    expect(segment('Local').getAttribute('aria-checked')).toBe('true')
    press(group, 'ArrowUp')
    press(group, 'Enter')
    expect(segment('None').getAttribute('aria-checked')).toBe('true')
  })

  it('should explain the read-only switch', () => {
    openForm()

    expect(readOnly().getAttribute('aria-describedby')).toBe('read-only-help')
    expect(
      screen.getByText('sqldoro and the database session refuse writes. Recommended.'),
    ).toBeDefined()
  })
})
