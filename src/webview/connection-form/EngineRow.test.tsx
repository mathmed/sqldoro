import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  click,
  issueOf,
  openForm,
  textField,
  typeIn,
} from '../../../test/webview/connection-form.ts'

function engine(name: string): HTMLElement {
  return screen.getByRole('radio', { name })
}

describe('the server type', () => {
  it('should offer the engines of the extension, the first chosen for a new connection', () => {
    openForm()

    const group = screen.getByRole('radiogroup', { name: 'Server type' })
    expect(
      [...group.querySelectorAll('[role="radio"]')].map((radio) => radio.textContent),
    ).toStrictEqual(['MySQL', 'PostgreSQL'])
    expect(engine('MySQL').getAttribute('aria-checked')).toBe('true')
    expect(engine('MySQL').tabIndex).toBe(0)
    expect(engine('PostgreSQL').tabIndex).toBe(-1)
  })

  it('should bring the default port of the engine chosen, unless the port was changed', () => {
    openForm()

    click('PostgreSQL', 'radio')
    expect(engine('PostgreSQL').getAttribute('aria-checked')).toBe('true')
    expect(textField('Port').value).toBe('5432')
    typeIn(textField('Port'), '6543')
    click('MySQL', 'radio')

    expect(textField('Port').value).toBe('6543')
    expect(engine('MySQL').getAttribute('aria-checked')).toBe('true')
  })

  it('should move along the engines with the arrow keys, round the ends', () => {
    openForm()
    const group = screen.getByRole('radiogroup', { name: 'Server type' })

    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(engine('PostgreSQL').getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(engine('PostgreSQL'))
    expect(textField('Port').value).toBe('5432')
    fireEvent.keyDown(group, { key: 'ArrowDown' })
    expect(engine('MySQL').getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    fireEvent.keyDown(group, { key: 'Enter' })
    expect(engine('PostgreSQL').getAttribute('aria-checked')).toBe('true')
  })

  it('should say when the engine of a connection is not registered', () => {
    openForm({ mode: 'edit', connection: { ...VALID_CONNECTION, engine: 'oracle' } })

    click('Save')

    const group = screen.getByRole('radiogroup', { name: 'Server type' })
    expect(issueOf(group)).toBe('Unknown database engine "oracle"')
    expect(engine('MySQL').getAttribute('aria-checked')).toBe('false')
    expect(engine('MySQL').tabIndex).toBe(0)
    expect(document.activeElement).toBe(group)
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(engine('PostgreSQL').getAttribute('aria-checked')).toBe('true')
    expect(issueOf(group)).toBeNull()
  })
})
