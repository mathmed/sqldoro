import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  click,
  issueOf,
  openForm,
  textField,
  typeAndLeave,
  typeIn,
} from '../../../test/webview/connection-form.ts'
import { fakeVsCodeApi, fromHost } from '../../../test/webview/vscode-api.ts'
import type { FormViewMessage } from '../../core/connection-form/protocol.ts'
import { App } from './App.tsx'

describe('the connection form', () => {
  it('should tell the extension it is ready, and wait for the connection', () => {
    const api = fakeVsCodeApi<FormViewMessage>()
    render(<App api={api} />)

    expect(api.posted()).toStrictEqual([{ type: 'ready' }])
    expect(screen.getByText('Loading the connection…')).toBeDefined()
    fromHost({ type: 'tested', isSuccess: true, message: 'early' })
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('should open on a new connection in a card, its name in focus', () => {
    openForm()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('MySQL')
    expect(screen.getByRole('form', { name: 'MySQL New connection' })).toBeDefined()
    expect(document.activeElement).toBe(textField('Connection name'))
    expect(textField('Connection name').placeholder).toBe('Connection name')
    expect(textField('Host').value).toBe('localhost')
    expect(textField('Port').value).toBe('3306')
  })

  it('should title the form of a saved connection', () => {
    openForm({ mode: 'edit', connection: VALID_CONNECTION })

    expect(screen.getByRole('form', { name: 'MySQL Edit connection' })).toBeDefined()
    expect(textField('Connection name').value).toBe('Shop')
    expect(screen.queryByRole('button', { name: 'Choose another database' })).toBeNull()
  })

  it('should report a message of the extension it cannot read', () => {
    const { sent } = openForm()

    fromHost({ type: 'file', field: 'host', path: '/x' })

    expect(sent('problem')).toStrictEqual([
      {
        type: 'problem',
        message:
          'The connection form received a message it cannot read: "field" must be a known value',
      },
    ])
  })

  it('should mark the required fields', () => {
    openForm()

    const label = screen.getByText('Connection name', { selector: 'label' })
    expect(label.querySelector('.required')?.getAttribute('aria-hidden')).toBe('true')
    expect(textField('Connection name').getAttribute('aria-required')).toBe('true')
    expect(textField('Username').getAttribute('aria-required')).toBe('true')
  })
})

describe('validation as the user types', () => {
  it('should show the problem of a field once it was left, and while it is typed', () => {
    openForm()
    const name = textField('Connection name')

    typeIn(name, 'a\u0007')
    expect(issueOf(name)).toBe('The name cannot contain control characters')
    expect(name.getAttribute('aria-invalid')).toBe('true')
    typeIn(name, 'Shop')
    expect(issueOf(name)).toBeNull()
    expect(name.getAttribute('aria-invalid')).toBe('false')
    fireEvent.blur(textField('Username'))
    expect(issueOf(textField('Username'))).toBe('Enter the user to log in as')
  })

  it('should say nothing about a field the user has not touched', () => {
    openForm()

    expect(issueOf(textField('Connection name'))).toBeNull()
    expect(issueOf(textField('Username'))).toBeNull()
  })

  it('should find a name another connection has', () => {
    openForm()

    typeAndLeave(textField('Connection name'), ' Billing ')

    expect(issueOf(textField('Connection name'))).toBe(
      'Another connection is already named "Billing"',
    )
  })
})

describe('cancel', () => {
  it('should ask the extension to close the form', () => {
    const { sent } = openForm()

    click('Cancel')

    expect(sent('cancel')).toStrictEqual([{ type: 'cancel' }])
  })
})
