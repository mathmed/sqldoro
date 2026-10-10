import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  click,
  issueOf,
  openForm,
  textField,
  typeIn,
} from '../../../test/webview/connection-form.ts'

function card(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name })
}

describe('the engine picker', () => {
  it('should offer a card for each engine with its default port, the first in focus', () => {
    openForm({ start: 'picker' })

    expect(screen.getByRole('region', { name: 'New connection' })).toBeDefined()
    expect(card(/MySQL/).textContent).toBe('MySQLDefault port 3306')
    expect(card(/PostgreSQL/).textContent).toBe('PostgreSQLDefault port 5432')
    expect(document.activeElement).toBe(card(/MySQL/))
    expect(card(/MySQL/).getAttribute('aria-current')).toBe('true')
    expect(card(/PostgreSQL/).getAttribute('aria-current')).toBe('false')
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('should go to the fields of the engine chosen, with its default port', () => {
    openForm({ start: 'picker' })

    click(/PostgreSQL/)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('PostgreSQL')
    expect(textField('Port').value).toBe('5432')
    expect(document.activeElement).toBe(textField('Connection name'))
  })

  it('should go back to the engines keeping what was typed, and a port the user changed', () => {
    openForm({ start: 'picker' })
    click(/PostgreSQL/)
    typeIn(textField('Host'), 'db.example.com')
    typeIn(textField('Port'), '6543')

    click('Choose another database')
    expect(document.activeElement).toBe(card(/PostgreSQL/))
    expect(card(/PostgreSQL/).className).toBe('engine-card current')
    click(/MySQL/)

    expect(textField('Host').value).toBe('db.example.com')
    expect(textField('Port').value).toBe('6543')
  })

  it('should let a saved connection with an engine that is not registered choose another', () => {
    openForm({ mode: 'edit', connection: { ...VALID_CONNECTION, engine: 'oracle' } })

    click('Save connection')

    const back = screen.getByRole('button', { name: 'Choose another database' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('oracle')
    expect(issueOf(back)).toBe('Unknown database engine "oracle"')
    expect(document.activeElement).toBe(back)
    click('Choose another database')
    expect(screen.getByRole('region', { name: 'Edit connection' })).toBeDefined()
    expect(document.activeElement).toBe(card(/MySQL/))
    expect(card(/MySQL/).getAttribute('aria-current')).toBe('false')
    click(/PostgreSQL/)
    expect(screen.queryByRole('button', { name: 'Choose another database' })).toBeNull()
  })

  it('should offer to import a connection string instead', () => {
    openForm({ start: 'picker' })

    click('Import connection string')

    expect(document.activeElement).toBe(screen.getByLabelText('Connection string'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('MySQL')
  })
})
