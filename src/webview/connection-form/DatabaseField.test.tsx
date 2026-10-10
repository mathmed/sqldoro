import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import {
  click,
  databaseField,
  issueOf,
  openForm,
  press,
  secretInput,
  textField,
  typeAndLeave,
  typeIn,
} from '../../../test/webview/connection-form.ts'
import { fromHost } from '../../../test/webview/vscode-api.ts'

const SAVED = { mode: 'edit', connection: VALID_CONNECTION, heldSecrets: ['password'] } as const
const LIST = 'List the databases of the server'

function names(): (string | null)[] {
  const list = screen.queryByRole('listbox', { name: 'Databases of the server' })
  return [...(list?.querySelectorAll('[role="option"]') ?? [])].map((option) => option.textContent)
}

function note(): string | null | undefined {
  return document.querySelector('.listing-note')?.textContent
}

function listed(...databases: string[]): void {
  click(LIST)
  fromHost({ type: 'databases', names: databases })
}

describe('the database', () => {
  it('should take the database to open, typed', () => {
    openForm()

    typeAndLeave(databaseField(), 'shop\u0007')
    expect(issueOf(databaseField())).toBe('The database cannot contain control characters')
    typeIn(databaseField(), 'shop')

    expect(databaseField()).toMatchObject({ value: 'shop', placeholder: 'Default database' })
    expect(databaseField().getAttribute('aria-required')).toBe('false')
    expect(issueOf(databaseField())).toBeNull()
  })

  it('should list the databases of the server with the connection as typed, once at a time', () => {
    const { sent } = openForm(SAVED)
    typeIn(secretInput('Password'), 'pw')

    click(LIST)
    click(LIST)

    expect(sent('listDatabases')).toStrictEqual([
      {
        type: 'listDatabases',
        draft: { connection: VALID_CONNECTION, secretChanges: [{ kind: 'password', value: 'pw' }] },
      },
    ])
    expect(note()).toBe('Listing the databases…')
    expect(screen.getByRole('button', { name: LIST })).toHaveProperty('disabled', true)
  })

  it('should show the names under the field, take the user there, and pick one on click', () => {
    openForm(SAVED)

    listed('app', 'shop')

    expect(names()).toStrictEqual(['app', 'shop'])
    expect(databaseField().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(databaseField())
    expect(note()).toBe('')
    fireEvent.mouseDown(screen.getByRole('option', { name: 'shop' }))
    click('shop', 'option')
    expect(databaseField().value).toBe('shop')
    expect(names()).toStrictEqual([])
    fireEvent.click(databaseField())
    expect(screen.getByRole('option', { name: 'shop' }).getAttribute('aria-selected')).toBe('true')
  })

  it('should move along the names with the arrow keys, pick with Enter and hide with Escape', () => {
    const { sent } = openForm(SAVED)
    listed('app', 'billing', 'shop')
    const field = databaseField()

    press(field, 'ArrowUp')
    expect(field.getAttribute('aria-activedescendant')).toBe('database-option-2')
    press(field, 'ArrowDown')
    expect(field.getAttribute('aria-activedescendant')).toBe('database-option-0')
    expect(screen.getByRole('option', { name: 'app' }).className).toBe('option active')
    press(field, 'Enter')
    expect(field.value).toBe('app')
    expect(sent('save')).toStrictEqual([])
    press(field, 'ArrowDown')
    expect(field.getAttribute('aria-activedescendant')).toBe('database-option-1')
    press(field, 'Escape')
    expect(names()).toStrictEqual([])
    expect(field.getAttribute('aria-activedescendant')).toBeNull()
  })

  it('should let other keys type, and Enter save, while no name is picked', () => {
    const { sent } = openForm(SAVED)
    listed('app')

    press(databaseField(), 'Enter')
    expect(databaseField().value).toBe('')
    expect(names()).toStrictEqual(['app'])
    press(databaseField(), 'Escape')
    press(databaseField(), 'Escape')
    press(databaseField(), 'a')
    fireEvent.submit(databaseField())

    expect(sent('save')).toHaveLength(1)
  })

  it('should keep the names while the user types, and hide them on leaving', () => {
    openForm(SAVED)
    listed('app', 'shop')

    typeIn(databaseField(), 'sh')
    expect(names()).toStrictEqual(['app', 'shop'])
    fireEvent.blur(databaseField())

    expect(names()).toStrictEqual([])
    typeIn(textField('Host'), 'db')
    press(databaseField(), 'ArrowDown')
    expect(names()).toStrictEqual([])
  })

  it("should show the server's error, or that it has no database for the user, inline", () => {
    openForm(SAVED)

    click(LIST)
    fromHost({ type: 'databasesFailed', message: 'Access denied for user app' })
    expect(note()).toBe('Could not list the databases: Access denied for user app')
    expect(document.querySelector('.listing-note')?.className).toBe('listing-note failed')
    listed()

    expect(note()).toBe('The server shows no database to this user')
    expect(databaseField().getAttribute('aria-expanded')).toBe('false')
  })

  it('should not list the databases of a connection with problems', () => {
    const { sent } = openForm()

    click(LIST)

    expect(sent('listDatabases')).toStrictEqual([])
    expect(document.activeElement).toBe(textField('Username'))
  })
})
