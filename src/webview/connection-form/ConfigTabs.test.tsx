import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  choose,
  click,
  issueOf,
  openForm,
  secretInput,
  tab,
  textField,
  typeAndLeave,
} from '../../../test/webview/connection-form.ts'
import { fromHost } from '../../../test/webview/vscode-api.ts'

function panel(): HTMLElement {
  return screen.getByRole('tabpanel')
}

describe('the setting tabs', () => {
  it('should show one tab at a time, and move along them with the arrow keys', () => {
    openForm()

    click(/SSL\/TLS/, 'tab')
    expect(panel().getAttribute('aria-labelledby')).toBe('tab-ssl')
    expect(tab(/SSL\/TLS/).getAttribute('aria-controls')).toBe('panel-ssl')
    expect(tab(/SSL\/TLS/).tabIndex).toBe(0)
    expect(tab(/Main/).tabIndex).toBe(-1)
    fireEvent.keyDown(screen.getByRole('tablist', { name: 'Settings' }), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tab(/SSH Tunnel/))
    expect(panel().id).toBe('panel-ssh')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(panel().id).toBe('panel-main')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Tab' })
    expect(panel().id).toBe('panel-main')
  })

  it('should keep what was typed in a tab when another one comes to the front', () => {
    openForm()

    typeAndLeave(textField('Host'), 'db.example.com')
    click(/SSH Tunnel/, 'tab')
    click(/Main/, 'tab')

    expect(textField('Host').value).toBe('db.example.com')
  })

  it('should mark the tabs whose fields show a problem', () => {
    openForm()

    typeAndLeave(textField('Host'), '')

    expect(tab(/Main/).textContent).toBe('Main!')
    expect(screen.getByRole('img', { name: 'has problems' })).toBeDefined()
    expect(tab(/SSL\/TLS/).textContent).toBe('SSL/TLS')
  })

  it('should say when SSL and the tunnel are on', () => {
    openForm({
      connection: {
        ...VALID_CONNECTION,
        ssl: { ...VALID_CONNECTION.ssl, mode: 'require' },
        ssh: { host: 'bastion', port: 22, user: 'ops', authMethod: 'password', privateKeyPath: '' },
      },
    })

    expect(tab(/SSL\/TLS/).textContent).toBe('SSL/TLSon')
    expect(tab(/SSH Tunnel/).textContent).toBe('SSH Tunnelon')
    expect(tab(/Main/).textContent).toBe('Main')
  })
})

describe('the SSL tab', () => {
  it('should show the certificate files once SSL is on, and forget them when it is off', () => {
    const { sent } = openForm()
    click(/SSL\/TLS/, 'tab')
    expect(screen.queryByRole('textbox', { name: 'CA certificate' })).toBeNull()

    choose('SSL mode', 'verify-full')
    typeAndLeave(textField('CA certificate'), '/certs/ca.pem')
    click('Browse for the client key')
    fromHost({ type: 'file', field: 'sslKeyPath', path: '/certs/client.key' })

    expect(sent('browse')).toStrictEqual([{ type: 'browse', field: 'sslKeyPath' }])
    expect(textField('Client key').value).toBe('/certs/client.key')
    expect(issueOf(textField('Client certificate'))).toBeNull()
    typeAndLeave(textField('Client certificate'), '')
    expect(issueOf(textField('Client certificate'))).toBe('A client key needs its certificate')
    choose('SSL mode', 'disable')
    choose('SSL mode', 'require')
    expect(textField('CA certificate').value).toBe('')
  })

  it('should describe the mode chosen', () => {
    openForm()
    click(/SSL\/TLS/, 'tab')

    choose('SSL mode', 'verify-ca')

    expect(
      screen.getByText('Encrypted; the certificate must be signed by a trusted CA'),
    ).toBeDefined()
    expect(
      screen.getByRole('combobox', { name: 'SSL mode' }).getAttribute('aria-describedby'),
    ).toBe('field-sslMode-help')
  })

  it('should let only require accept unauthorized certificates', () => {
    openForm()
    click(/SSL\/TLS/, 'tab')

    choose('SSL mode', 'require')
    const reject = screen.getByRole('switch', { name: 'Reject unauthorized certificates' })
    expect(reject).toHaveProperty('checked', true)
    fireEvent.click(reject)
    expect(reject).toHaveProperty('checked', false)
    choose('SSL mode', 'verify-full')

    expect(screen.queryByRole('switch', { name: 'Reject unauthorized certificates' })).toBeNull()
  })

  it('should clear a file, and refuse a path with control characters', () => {
    openForm()
    click(/SSL\/TLS/, 'tab')
    choose('SSL mode', 'require')

    typeAndLeave(textField('CA certificate'), '/ca\u0001')
    expect(issueOf(textField('CA certificate'))).toBe('The path cannot contain control characters')
    click('Clear the ca certificate')

    expect(textField('CA certificate').value).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear the ca certificate' })).toBeNull()
  })
})

describe('the SSH tab', () => {
  it('should show the fields of a tunnel with a password', () => {
    openForm()
    click(/SSH Tunnel/, 'tab')
    expect(screen.queryByRole('textbox', { name: 'SSH host' })).toBeNull()

    choose('Tunnel', 'password')

    expect(textField('SSH port').value).toBe('22')
    expect(secretInput('SSH password').placeholder).toBe('No password')
    expect(screen.queryByRole('textbox', { name: 'Private key' })).toBeNull()
    typeAndLeave(textField('SSH host'), 'bastion')
    typeAndLeave(textField('SSH port'), '2222')
    typeAndLeave(textField('SSH user'), 'ops')
    typeAndLeave(textField('SSH user'), '')
    expect(issueOf(textField('SSH user'))).toBe('Enter the SSH user')
  })

  it('should show the private key and its passphrase, chosen with the file dialog', () => {
    const { sent } = openForm()
    click(/SSH Tunnel/, 'tab')

    choose('Tunnel', 'private-key')
    click('Browse for the private key')
    fromHost({ type: 'file', field: 'sshPrivateKeyPath', path: '/home/me/.ssh/id_ed25519' })

    expect(sent('browse')).toStrictEqual([{ type: 'browse', field: 'sshPrivateKeyPath' }])
    expect(textField('Private key').value).toBe('/home/me/.ssh/id_ed25519')
    expect(secretInput('Passphrase').placeholder).toBe('No passphrase')
    expect(screen.queryByLabelText('SSH password')).toBeNull()
    choose('Tunnel', 'none')
    expect(screen.queryByRole('textbox', { name: 'Private key' })).toBeNull()
  })
})
