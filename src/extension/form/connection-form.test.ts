import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formContext as context, descriptionOf, draft, VALID } from '../../../test/support/form.ts'
import {
  answerInputs,
  answerQuickPicks,
  labelOf,
  lastQuickPickItems,
} from '../../../test/support/prompts.ts'
import { window } from '../../../test/vscode.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { runConnectionForm } from './connection-form.ts'

beforeEach(() => {
  vi.mocked(window.showErrorMessage).mockReset()
})

describe('runConnectionForm', () => {
  it('should save a valid draft as it is', async () => {
    answerQuickPicks('Save')

    await expect(runConnectionForm(draft(), context())).resolves.toStrictEqual(draft())
    expect(window.showQuickPick).toHaveBeenCalledWith(expect.any(Array), {
      title: 'Edit Connection',
      placeHolder: 'Select a field to change it, then save',
      ignoreFocusOut: true,
    })
  })

  it('should give up when the form is dismissed', async () => {
    answerQuickPicks(undefined)

    await expect(runConnectionForm(draft(), context())).resolves.toBeUndefined()
  })

  it('should show each field with its value and its problems, by section', async () => {
    answerQuickPicks(undefined)

    await runConnectionForm(draft({ ...VALID, host: '' }), context())

    expect(lastQuickPickItems().map(labelOf)).toStrictEqual([
      'Save',
      'Test Connection',
      'Connection',
      'Name',
      'Engine',
      'Host',
      'Port',
      'User',
      'Password',
      'Database',
      'Security',
      'SSL',
      'SSH tunnel',
      'Tunnel',
      'Safety',
      'Environment',
      'Writes',
    ])
    expect(lastQuickPickItems()).toContainEqual(
      expect.objectContaining({
        label: '$(check) Save',
        detail: '$(warning) Some fields need attention',
      }),
    )
    expect(lastQuickPickItems()).toContainEqual(
      expect.objectContaining({
        label: 'Host',
        description: '',
        detail: '$(warning) Enter the host name or IP address of the server',
      }),
    )
    expect(descriptionOf('Engine')).toBe('PostgreSQL')
    expect(descriptionOf('Port')).toBe('5432')
    expect(descriptionOf('Password')).toBe('not set')
    expect(descriptionOf('Database')).toBe('(default)')
    expect(descriptionOf('SSL')).toBe('Disabled')
    expect(descriptionOf('Tunnel')).toBe('No tunnel')
    expect(descriptionOf('Environment')).toBe('None')
    expect(descriptionOf('Writes')).toBe('Read-only (recommended)')
  })

  it('should refuse to save a draft with problems and say why', async () => {
    answerQuickPicks('Save', 'Host', 'Save')
    answerInputs('db.example.com')

    const result = await runConnectionForm(draft({ ...VALID, host: '' }), context())

    expect(window.showErrorMessage).toHaveBeenCalledExactlyOnceWith(
      'Fix the connection before saving it: Enter the host name or IP address of the server',
    )
    expect(result?.connection.host).toBe('db.example.com')
  })

  it('should test the connection being edited and stay in the form', async () => {
    const test = vi.fn(async () => Promise.resolve())
    answerQuickPicks('Test Connection', 'Save')

    await runConnectionForm(draft(), context(test))

    expect(test).toHaveBeenCalledExactlyOnceWith(draft())
  })

  it('should edit the text fields with their current value', async () => {
    answerQuickPicks('Name', 'Host', 'Port', 'User', 'Database', 'Save')
    answerInputs('Shop (prod)', 'db.example.com', '6543', 'admin', 'sales')

    const result = await runConnectionForm(draft(), context())

    expect(result?.connection).toMatchObject({
      name: 'Shop (prod)',
      host: 'db.example.com',
      port: 6543,
      user: 'admin',
      database: 'sales',
    })
    expect(window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Name',
        value: 'Shop',
        password: false,
        ignoreFocusOut: true,
      }),
    )
  })

  it('should keep a field when its prompt is dismissed', async () => {
    answerQuickPicks('Host', 'SSL', undefined, 'Save')
    answerInputs(undefined)

    await expect(runConnectionForm(draft(), context())).resolves.toStrictEqual(draft())
  })

  it('should give a new engine its default port unless the port was changed', async () => {
    answerQuickPicks('Engine', 'MySQL', 'Save')

    await expect(runConnectionForm(draft(), context())).resolves.toMatchObject({
      connection: { engine: 'mysql', port: 3306 },
    })

    answerQuickPicks('Engine', 'MySQL', 'Save')
    await expect(
      runConnectionForm(draft({ ...VALID, port: 6543 }), context()),
    ).resolves.toMatchObject({ connection: { engine: 'mysql', port: 6543 } })
  })

  it('should show an engine nobody registered as it is', async () => {
    answerQuickPicks(undefined)

    await runConnectionForm(draft({ ...VALID, engine: 'oracle' }), context())

    expect(descriptionOf('Engine')).toBe('oracle')
  })

  describe('secrets', () => {
    it('should ask for a password the connection does not have yet', async () => {
      answerQuickPicks('Password', 'Save')
      answerInputs('s3cret')

      const result = await runConnectionForm(draft(), context())

      expect(result?.secretChanges).toStrictEqual(new Map([[SecretKind.Password, 's3cret']]))
      expect(window.showInputBox).toHaveBeenCalledWith(
        expect.objectContaining({ password: true, value: '' }),
      )
    })

    it('should replace or remove a stored password', async () => {
      answerQuickPicks('Password', 'Enter a new password', 'Save')
      answerInputs('new')
      await expect(
        runConnectionForm(draft(VALID, [SecretKind.Password]), context()),
      ).resolves.toMatchObject({
        secretChanges: new Map([[SecretKind.Password, 'new']]),
      })

      answerQuickPicks('Password', 'Remove the password', undefined)
      await runConnectionForm(draft(VALID, [SecretKind.Password]), context())
      expect(descriptionOf('Password')).toBe('removed')
    })

    it('should show a changed password and keep it when the choice is dismissed', async () => {
      answerQuickPicks('Password', 'Password', undefined, undefined)
      answerInputs('first')

      await runConnectionForm(draft(), context())

      expect(descriptionOf('Password')).toBe('changed')
    })

    it('should keep a stored password when its prompt is dismissed', async () => {
      answerQuickPicks('Password', 'Enter a new password', 'Save')
      answerInputs(undefined)

      await expect(
        runConnectionForm(draft(VALID, [SecretKind.Password]), context()),
      ).resolves.toMatchObject({ secretChanges: new Map() })
    })
  })
})
