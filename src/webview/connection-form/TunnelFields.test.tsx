import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  choose,
  click,
  issueOf,
  openForm,
  secretInput,
  textField,
  typeAndLeave,
} from '../../../test/webview/connection-form.ts'
import { fromHost } from '../../../test/webview/vscode-api.ts'

describe('the tunnel', () => {
  it('should offer no tunnel and both ways to log in to SSH, none at first', () => {
    openForm()

    const tunnel = screen.getByRole('combobox', { name: 'Tunnel' })
    expect(
      [...tunnel.querySelectorAll('option')].map((option) => option.textContent),
    ).toStrictEqual(['None', 'SSH with password', 'SSH with private key'])
    expect(tunnel).toHaveProperty('value', 'none')
    expect(screen.queryByRole('group', { name: 'SSH tunnel' })).toBeNull()
  })

  it('should show the fields of a tunnel with a password just below', () => {
    openForm()

    choose('Tunnel', 'password')

    expect(screen.getByRole('group', { name: 'SSH tunnel' })).toBeDefined()
    expect(textField('SSH port').value).toBe('22')
    expect(textField('SSH host').placeholder).toBe('bastion.example.com')
    expect(secretInput('SSH password').placeholder).toBe('No password')
    expect(screen.queryByRole('textbox', { name: 'Private key' })).toBeNull()
    typeAndLeave(textField('SSH host'), 'bastion')
    typeAndLeave(textField('SSH port'), '2222')
    typeAndLeave(textField('SSH user'), 'ops')
    expect(textField('SSH user').value).toBe('ops')
    typeAndLeave(textField('SSH user'), '')
    expect(issueOf(textField('SSH user'))).toBe('Enter the SSH user')
    expect(textField('SSH port').value).toBe('2222')
  })

  it('should show the private key and its passphrase, chosen with the file dialog', () => {
    const { sent } = openForm()

    choose('Tunnel', 'private-key')
    click('Browse for the private key')
    fromHost({ type: 'file', field: 'sshPrivateKeyPath', path: '/home/me/.ssh/id_ed25519' })

    expect(sent('browse')).toStrictEqual([{ type: 'browse', field: 'sshPrivateKeyPath' }])
    expect(textField('Private key').value).toBe('/home/me/.ssh/id_ed25519')
    expect(textField('Private key').getAttribute('aria-required')).toBe('true')
    expect(secretInput('Passphrase').placeholder).toBe('No passphrase')
    expect(screen.queryByLabelText('SSH password')).toBeNull()
    click('Clear the private key')
    expect(textField('Private key').value).toBe('')
    choose('Tunnel', 'none')
    expect(screen.queryByRole('textbox', { name: 'Private key' })).toBeNull()
  })

  it('should ignore a value that is none of its options', () => {
    openForm()

    choose('Tunnel', 'telnet')

    expect(screen.getByRole('combobox', { name: 'Tunnel' })).toHaveProperty('value', 'none')
  })
})
