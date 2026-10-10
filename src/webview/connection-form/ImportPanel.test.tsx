import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NEW_CONNECTION, VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  click,
  issueOf,
  openForm,
  press,
  secretInput,
  textField,
  typeIn,
} from '../../../test/webview/connection-form.ts'
import { fromHost } from '../../../test/webview/vscode-api.ts'

const URL = 'postgres://app:pa55@db.example.com:6432/shop?sslmode=require&x=1'
const IMPORTED = {
  ...NEW_CONNECTION,
  name: 'db.example.com/shop',
  engine: 'postgres',
  host: 'db.example.com',
  port: 6432,
  user: 'app',
  database: 'shop',
  ssl: { ...NEW_CONNECTION.ssl, mode: 'require' },
}

function connectionString(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>('Connection string')
}

describe('importing a connection string', () => {
  it('should open a masked input in the card, in focus', () => {
    openForm()
    expect(screen.queryByLabelText('Connection string')).toBeNull()

    click('Import connection string')

    expect(connectionString()).toMatchObject({ type: 'password', value: '' })
    expect(document.activeElement).toBe(connectionString())
    expect(
      screen
        .getByRole('button', { name: 'Import connection string' })
        .getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('should open on the input when the extension starts there or asks for it', () => {
    openForm({ start: 'import' })
    expect(document.activeElement).toBe(connectionString())
    click('Close the connection string')
    expect(screen.queryByLabelText('Connection string')).toBeNull()

    fromHost({ type: 'showImport' })

    expect(document.activeElement).toBe(connectionString())
  })

  it('should send the connection string once, and fill the fields with what it holds', () => {
    const { sent } = openForm({ start: 'import' })
    typeIn(connectionString(), URL)

    click('Apply')
    click('Apply')
    fromHost({
      type: 'imported',
      connection: IMPORTED,
      urlSecrets: ['password'],
      warnings: ['Ignored the URL parameter "x"', 'Ignored the URL parameter "x"'],
    })

    expect(sent('import')).toStrictEqual([{ type: 'import', text: URL }])
    expect(screen.queryByLabelText('Connection string')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('PostgreSQL')
    expect(textField('Connection name').value).toBe('db.example.com/shop')
    expect(textField('Port').value).toBe('6432')
    expect(secretInput('Password').placeholder).toBe('From the URL — type to replace')
    expect(screen.getByRole('combobox', { name: 'SSL mode' })).toHaveProperty('value', 'require')
    const notes = screen.getByRole('note', { name: 'About the connection string' })
    expect([...notes.querySelectorAll('li')].map((item) => item.textContent)).toStrictEqual([
      'Ignored the URL parameter "x"',
    ])
  })

  it('should apply on Enter and close on Escape, forgetting what was typed', () => {
    const { sent } = openForm({ mode: 'edit', connection: VALID_CONNECTION })
    click('Import connection string')
    typeIn(connectionString(), 'mysql://root@db/app')

    press(connectionString(), 'Enter')
    press(connectionString(), 'a')
    press(connectionString(), 'Escape')
    click('Import connection string')

    expect(sent('import')).toStrictEqual([{ type: 'import', text: 'mysql://root@db/app' }])
    expect(sent('save')).toStrictEqual([])
    expect(connectionString().value).toBe('')
  })

  it('should say why the connection string was refused, until it is typed again', () => {
    openForm({ start: 'import' })
    typeIn(connectionString(), 'mongodb://db')
    click('Apply')

    fromHost({ type: 'importRefused', message: 'Unsupported URL scheme "mongodb"' })

    expect(issueOf(connectionString())).toBe('Unsupported URL scheme "mongodb"')
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', false)
    expect(connectionString().getAttribute('aria-describedby')).toBe(
      'field-connectionString-issue field-connectionString-help',
    )
    typeIn(connectionString(), 'mysql://db')
    expect(issueOf(connectionString())).toBeNull()
  })
})
