import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  choose,
  click,
  issueOf,
  openForm,
  textField,
  typeAndLeave,
} from '../../../test/webview/connection-form.ts'
import { fromHost } from '../../../test/webview/vscode-api.ts'

const TOGGLE = 'Advanced settings · SSL/TLS certificates'

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: TOGGLE })
}

function sslMode(): HTMLElement | null {
  return screen.queryByRole('combobox', { name: 'SSL mode' })
}

describe('the SSL line', () => {
  it('should say SSL is off, and open the SSL settings on the SSL mode', () => {
    openForm()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(sslMode()).toBeNull()

    click('SSL off')

    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(sslMode())
    click('SSL off')
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })

  it('should name the SSL mode once SSL is on', () => {
    openForm()
    click(TOGGLE)

    choose('SSL mode', 'verify-full')

    expect(screen.getByRole('button', { name: 'SSL: verify-full' })).toBeDefined()
  })
})

describe('the advanced settings', () => {
  it('should fold and unfold', () => {
    openForm()

    click(TOGGLE)
    expect(sslMode()).not.toBeNull()
    expect(toggle().getAttribute('aria-controls')).toBe('advanced-settings')
    click(TOGGLE)

    expect(sslMode()).toBeNull()
  })

  it('should open by themselves when the connection uses SSL', () => {
    openForm({
      mode: 'edit',
      connection: { ...VALID_CONNECTION, ssl: { ...VALID_CONNECTION.ssl, mode: 'verify-ca' } },
    })

    expect(sslMode()).toHaveProperty('value', 'verify-ca')
    expect(
      screen.getByText('Encrypted; the certificate must be signed by a trusted CA'),
    ).toBeDefined()
    expect(sslMode()?.getAttribute('aria-describedby')).toBe('field-sslMode-help')
  })

  it('should show the certificate files once SSL is on, and forget them when it is off', () => {
    const { sent } = openForm()
    click(TOGGLE)
    expect(screen.queryByRole('textbox', { name: 'CA certificate' })).toBeNull()

    choose('SSL mode', 'verify-full')
    typeAndLeave(textField('CA certificate'), '/certs/ca.pem')
    click('Browse for the client key')
    fromHost({ type: 'file', field: 'sslKeyPath', path: '/certs/client.key' })

    expect(sent('browse')).toStrictEqual([{ type: 'browse', field: 'sslKeyPath' }])
    expect(textField('Client key').value).toBe('/certs/client.key')
    typeAndLeave(textField('Client certificate'), '')
    expect(issueOf(textField('Client certificate'))).toBe('A client key needs its certificate')
    expect(screen.getByRole('img', { name: 'has problems' })).toBeDefined()
    choose('SSL mode', 'disable')
    choose('SSL mode', 'require')
    expect(textField('CA certificate').value).toBe('')
  })

  it('should let only require accept unauthorized certificates', () => {
    openForm()
    click(TOGGLE)

    choose('SSL mode', 'require')
    const reject = screen.getByRole('switch', { name: 'Reject unauthorized certificates' })
    expect(reject).toHaveProperty('checked', true)
    click('Reject unauthorized certificates', 'switch')
    expect(reject).toHaveProperty('checked', false)
    choose('SSL mode', 'verify-full')

    expect(screen.queryByRole('switch', { name: 'Reject unauthorized certificates' })).toBeNull()
  })

  it('should clear a file, and refuse a path with control characters', () => {
    openForm()
    click(TOGGLE)
    choose('SSL mode', 'require')

    typeAndLeave(textField('CA certificate'), '/ca\u0001')
    expect(issueOf(textField('CA certificate'))).toBe('The path cannot contain control characters')
    click('Clear the ca certificate')

    expect(textField('CA certificate').value).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear the ca certificate' })).toBeNull()
  })
})
