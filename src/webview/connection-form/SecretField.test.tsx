import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import { click, openForm, secretInput, typeIn } from '../../../test/webview/connection-form.ts'

describe('the secrets of the connection', () => {
  it('should leave the password empty when the extension holds none', () => {
    openForm()

    expect(secretInput('Password')).toMatchObject({
      type: 'password',
      value: '',
      placeholder: 'No password',
    })
    expect(secretInput('Password').autocomplete).toBe('new-password')
    expect(screen.queryByRole('button', { name: 'Remove the password' })).toBeNull()
  })

  it('should say a password is saved without showing it, and replace it with what is typed', () => {
    const { api } = openForm({
      mode: 'edit',
      connection: VALID_CONNECTION,
      heldSecrets: ['password'],
    })
    const password = secretInput('Password')

    expect(password).toMatchObject({ value: '', placeholder: 'Saved — type to replace' })
    typeIn(password, 'n3w')
    expect(password.value).toBe('n3w')
    typeIn(password, '')

    expect(password.placeholder).toBe('Saved — type to replace')
    expect(api.getState()).toBeUndefined()
  })

  it('should say the password comes from the imported URL', () => {
    openForm({ heldSecrets: ['password'] })

    expect(secretInput('Password').placeholder).toBe('From the URL — type to replace')
  })

  it('should remove a held password, and keep it again', () => {
    openForm({ mode: 'edit', connection: VALID_CONNECTION, heldSecrets: ['password'] })
    typeIn(secretInput('Password'), 'typed')

    click('Remove the password')
    expect(secretInput('Password')).toMatchObject({
      value: '',
      placeholder: 'Removed when you save — type to set a new one',
    })
    click('Keep the password')

    expect(secretInput('Password').placeholder).toBe('Saved — type to replace')
    expect(screen.getByRole('button', { name: 'Remove the password' }).textContent).toBe('Remove')
  })
})
