import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  click,
  issueOf,
  openForm,
  secretInput,
  textField,
  typeIn,
} from '../../../test/webview/connection-form.ts'
import { fromHost } from '../../../test/webview/vscode-api.ts'

const SAVED = { mode: 'edit', connection: VALID_CONNECTION, heldSecrets: ['password'] } as const

function status(): string | null {
  return screen.getByRole('status').textContent
}

describe('Test', () => {
  it('should test the draft with the secrets typed, once at a time, and show how it went', () => {
    const { sent } = openForm(SAVED)
    typeIn(secretInput('Password'), 's3cret')

    click('Test')
    click('Test')

    expect(sent('test')).toStrictEqual([
      {
        type: 'test',
        draft: {
          connection: VALID_CONNECTION,
          secretChanges: [{ kind: 'password', value: 's3cret' }],
        },
      },
    ])
    expect(status()).toBe('Testing the connection…')
    expect(screen.getByRole('button', { name: 'Test' })).toHaveProperty('disabled', true)
    fromHost({ type: 'tested', isSuccess: true, message: 'Connected: MySQL 8.4' })
    expect(status()).toBe('Connected: MySQL 8.4')
    expect(screen.getByRole('status').className).toBe('test-status succeeded')
  })

  it("should show the server's error, and forget the result once the draft changes", () => {
    openForm(SAVED)

    click('Test')
    fromHost({ type: 'tested', isSuccess: false, message: 'Access denied' })
    expect(status()).toBe('Could not connect: Access denied')
    expect(screen.getByRole('status').className).toBe('test-status failed')
    typeIn(textField('Host'), 'db')

    expect(status()).toBe('')
  })

  it('should test a connection without a name, not one with other problems', () => {
    const { sent } = openForm()

    click('Test')

    expect(sent('test')).toStrictEqual([])
    expect(issueOf(textField('Username'))).toBe('Enter the user to log in as')
    expect(document.activeElement).toBe(textField('Username'))
    typeIn(textField('Username'), 'app')
    click('Test')
    expect(sent('test')).toHaveLength(1)
  })
})

describe('Save connection', () => {
  it('should send the draft with the secrets typed once, and wait for the extension', () => {
    const { sent } = openForm(SAVED)
    typeIn(secretInput('Password'), 'n3w')
    const save = screen.getByRole('button', { name: 'Save connection' })

    fireEvent.click(save)
    fireEvent.click(save)

    expect(sent('save')).toStrictEqual([
      {
        type: 'save',
        draft: {
          connection: VALID_CONNECTION,
          secretChanges: [{ kind: 'password', value: 'n3w' }],
        },
      },
    ])
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Test' })).toHaveProperty('disabled', true)
  })

  it('should save on Enter in a field', () => {
    const { sent } = openForm(SAVED)

    fireEvent.submit(textField('Host'))

    expect(sent('save')).toHaveLength(1)
  })

  it('should show every problem and focus the first field going down the form', () => {
    const { sent } = openForm()

    click('Save connection')

    expect(sent('save')).toStrictEqual([])
    expect(document.activeElement).toBe(textField('Connection name'))
    expect(issueOf(textField('Connection name'))).toBe('Enter a name for the connection')
    expect(issueOf(textField('Username'))).toBe('Enter the user to log in as')
  })

  it('should take the user to the tunnel fields before the SSL settings', () => {
    openForm({
      connection: {
        ...VALID_CONNECTION,
        ssh: { host: '', port: 22, user: 'ops', authMethod: 'password', privateKeyPath: '' },
        ssl: { ...VALID_CONNECTION.ssl, mode: 'require', keyPath: '/key' },
      },
    })

    click('Save connection')

    expect(document.activeElement).toBe(textField('SSH host'))
    expect(issueOf(textField('Client certificate'))).toBe('A client key needs its certificate')
  })

  it('should open the advanced settings to take the user to a problem there', () => {
    openForm({
      connection: { ...VALID_CONNECTION, ssl: { ...VALID_CONNECTION.ssl, certPath: '/cert' } },
    })
    click('Advanced settings · SSL/TLS certificates')
    expect(screen.queryByRole('combobox', { name: 'SSL mode' })).toBeNull()

    click('Save connection')

    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'SSL mode' }))
    expect(screen.getByRole('img', { name: 'has problems' })).toBeDefined()
  })

  it('should show why the extension refused, and send again once fixed', () => {
    const { sent } = openForm()
    typeIn(textField('Connection name'), 'Shop')
    typeIn(textField('Username'), 'app')
    click('Save connection')

    fromHost({
      type: 'saveRefused',
      message: 'Fix the fields marked in the form, then save again.',
      issues: [{ field: 'host', message: 'Another connection uses this host' }],
    })

    expect(screen.getByRole('alert').textContent).toBe(
      'Fix the fields marked in the form, then save again.',
    )
    expect(issueOf(textField('Host'))).toBe('Another connection uses this host')
    expect(document.activeElement).toBe(textField('Host'))
    typeIn(textField('Host'), 'db')
    expect(screen.getByRole('alert').textContent).toBe('')
    click('Save connection')
    expect(sent('save')).toHaveLength(2)
  })
})
