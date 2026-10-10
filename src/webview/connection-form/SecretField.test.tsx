import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import { click, openForm, secretInput, typeIn } from '../../../test/webview/connection-form.ts'
import { fromHost } from '../../../test/webview/vscode-api.ts'

const SAVED = { mode: 'edit', connection: VALID_CONNECTION, heldSecrets: ['password'] } as const

function eye(): HTMLElement {
  return screen.getByRole('button', { name: 'Show the password' })
}

describe('the secrets of the connection', () => {
  it('should leave the password empty when the extension holds none, and say where it goes', () => {
    openForm()

    expect(secretInput('Password')).toMatchObject({
      type: 'password',
      value: '',
      placeholder: 'No password',
    })
    expect(secretInput('Password').autocomplete).toBe('new-password')
    expect(secretInput('Password').getAttribute('aria-describedby')).toBe('secret-password-help')
    expect(screen.getAllByText("Saved in VS Code's secret storage")).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
  })

  it('should reveal what was typed with the eye, and mask it again', () => {
    openForm(SAVED)
    typeIn(secretInput('Password'), 's3cret')

    click('Show the password')
    expect(secretInput('Password').type).toBe('text')
    expect(eye().getAttribute('aria-pressed')).toBe('true')
    click('Show the password')

    expect(secretInput('Password').type).toBe('password')
    expect(eye().getAttribute('aria-pressed')).toBe('false')
  })

  it('should never reveal a saved password: the input only holds what is typed', () => {
    openForm(SAVED)

    click('Show the password')

    expect(secretInput('Password')).toMatchObject({ type: 'text', value: '' })
    expect(secretInput('Password').placeholder).toBe('Saved — type to replace')
  })

  it('should say a password is saved without showing it, and replace it with what is typed', () => {
    const { api } = openForm(SAVED)
    const password = secretInput('Password')

    typeIn(password, 'n3w')
    expect(password.value).toBe('n3w')
    typeIn(password, '')

    expect(password.placeholder).toBe('Saved — type to replace')
    expect(api.getState()).toBeUndefined()
  })

  it('should remove a saved password, and keep it again', () => {
    openForm(SAVED)
    typeIn(secretInput('Password'), 'typed')

    click('Remove saved password')
    expect(secretInput('Password')).toMatchObject({
      value: '',
      placeholder: 'Removed when you save — type to set a new one',
    })
    click('Keep saved password')

    expect(secretInput('Password').placeholder).toBe('Saved — type to replace')
    expect(screen.getByRole('button', { name: 'Remove saved password' })).toBeDefined()
  })

  it('should say the password comes from an imported URL', () => {
    openForm(SAVED)

    fromHost({
      type: 'imported',
      connection: VALID_CONNECTION,
      urlSecrets: ['password'],
      warnings: [],
    })

    expect(secretInput('Password').placeholder).toBe('From the URL — type to replace')
    click("Remove the URL's password")
    expect(screen.getByRole('button', { name: "Keep the URL's password" })).toBeDefined()
  })
})
