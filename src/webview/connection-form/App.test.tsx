import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  choose,
  click,
  issueOf,
  openForm,
  tab,
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

  it('should open on a new connection with its name in focus', () => {
    openForm()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('New Connection')
    expect(screen.getByRole('form', { name: 'New Connection' })).toBeDefined()
    expect(document.activeElement).toBe(textField('Name'))
    expect(textField('Host').value).toBe('localhost')
    expect(textField('Port').value).toBe('3306')
    expect(tab(/Main/).getAttribute('aria-selected')).toBe('true')
  })

  it('should title the form of a saved connection', () => {
    openForm({ mode: 'edit', connection: VALID_CONNECTION })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Edit Connection')
    expect(textField('Name').value).toBe('Shop')
  })

  it('should show what the extension says about the connection, once each', () => {
    openForm({ notices: ['Ignored the URL parameter "a"', 'Ignored the URL parameter "a"', 'b'] })

    const notes = screen.getByRole('note', { name: 'About this connection' })
    expect([...notes.querySelectorAll('li')].map((item) => item.textContent)).toStrictEqual([
      'Ignored the URL parameter "a"',
      'b',
    ])
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

    const label = screen.getByText('Name', { selector: 'label' })
    expect(label.querySelector('.required')?.getAttribute('aria-hidden')).toBe('true')
    expect(textField('Name').getAttribute('aria-required')).toBe('true')
    expect(textField('Database').getAttribute('aria-required')).toBe('false')
    expect(textField('Database').placeholder).toBe('Default database')
  })

  it('should take the database to open', () => {
    openForm()

    typeAndLeave(textField('Database'), 'shop\u0007')
    expect(issueOf(textField('Database'))).toBe('The database cannot contain control characters')
    typeIn(textField('Database'), 'shop')

    expect(textField('Database').value).toBe('shop')
    expect(issueOf(textField('Database'))).toBeNull()
  })
})

describe('validation as the user types', () => {
  it('should show the problem of a field once it was left, and while it is typed', () => {
    openForm()
    const name = textField('Name')

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

    expect(issueOf(textField('Name'))).toBeNull()
    expect(issueOf(textField('Username'))).toBeNull()
  })

  it('should find a name another connection has', () => {
    openForm()

    typeAndLeave(textField('Name'), ' Billing ')

    expect(issueOf(textField('Name'))).toBe('Another connection is already named "Billing"')
  })

  it('should treat a port that is not a whole number from 1 to 65535 as no port', () => {
    openForm()
    const port = textField('Port')

    typeAndLeave(port, '70000')
    expect(port.value).toBe('70000')
    expect(issueOf(port)).toBe('The port must be a whole number from 1 to 65535')
    typeIn(port, '')
    expect(port.value).toBe('')
    typeIn(port, '0543')
    expect(port.value).toBe('0543')
    expect(issueOf(port)).toBeNull()
    expect(port.getAttribute('inputmode')).toBe('numeric')
  })
})

describe('the safety of the connection', () => {
  it('should make the connection read-only when it is tagged as production', () => {
    openForm()
    const readOnly = screen.getByRole('switch', { name: 'Read-only' })

    fireEvent.click(readOnly)
    expect(readOnly).toHaveProperty('checked', false)
    choose('Environment', 'staging')

    expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveProperty('value', 'staging')
    expect(readOnly).toHaveProperty('checked', true)
    fireEvent.click(readOnly)
    choose('Environment', 'dev')
    expect(readOnly).toHaveProperty('checked', false)
  })

  it('should explain the read-only switch and offer every environment', () => {
    openForm()

    expect(screen.getByRole('switch', { name: 'Read-only' }).getAttribute('aria-describedby')).toBe(
      'read-only-help',
    )
    expect(
      screen
        .getAllByRole('option')
        .slice(0, 5)
        .map((option) => option.textContent),
    ).toStrictEqual(['None', 'Local', 'Development', 'Staging', 'Production'])
  })

  it('should ignore a value that is none of its options', () => {
    openForm()

    choose('Environment', 'qa')

    expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveProperty('value', 'none')
  })
})

describe('cancel', () => {
  it('should ask the extension to close the form', () => {
    const { sent } = openForm()

    click('Cancel')

    expect(sent('cancel')).toStrictEqual([{ type: 'cancel' }])
  })
})
