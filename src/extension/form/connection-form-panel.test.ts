import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { saved } from '../../../test/support/commands.ts'
import {
  type FormHarness,
  formHarness,
  fromForm,
  sentToForm,
  settled,
  SHOP,
} from '../../../test/support/forms.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { FormMode } from '../../core/connection-form/protocol.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'

let harness: FormHarness

function draft(connection: ConnectionConfig = SHOP, secretChanges: object[] = []): object {
  return { connection, secretChanges }
}

beforeEach(() => {
  resetVscode()
  window.showInformationMessage.mockReset()
  harness = formHarness()
})

afterEach(() => {
  harness.dispose()
})

describe('testing from the form', () => {
  it('should test the draft with the typed secrets over the held ones', async () => {
    await saved(harness.commands, SHOP, new Map([[SecretKind.Password, 'stored']]))
    const panel = await harness.loaded()

    await fromForm(panel, { type: 'test', draft: draft() })
    await fromForm(panel, {
      type: 'test',
      draft: draft({ ...SHOP, name: '' }, [{ kind: 'password', value: '' }]),
    })

    expect(harness.test.mock.calls).toStrictEqual([
      [SHOP, new Map([[SecretKind.Password, 'stored']])],
      [{ ...SHOP, name: '' }, new Map()],
    ])
    expect(sentToForm(panel, 'tested')).toStrictEqual([
      { type: 'tested', isSuccess: true, message: 'Connected: MySQL 8.4' },
      { type: 'tested', isSuccess: true, message: 'Connected: MySQL 8.4' },
    ])
  })

  it('should test with the password of an imported URL unless one was typed', async () => {
    const pendingSecrets = new Map([[SecretKind.Password, 'from-url']])
    const panel = await harness.loaded({ mode: FormMode.New, pendingSecrets })

    await fromForm(panel, { type: 'test', draft: draft() })
    await fromForm(panel, { type: 'test', draft: draft(SHOP, [{ kind: 'password', value: 'x' }]) })

    expect(harness.test.mock.calls.map(([, secrets]) => secrets)).toStrictEqual([
      new Map([[SecretKind.Password, 'from-url']]),
      new Map([[SecretKind.Password, 'x']]),
    ])
  })

  it('should test a new connection with what was typed, without asking the keyring', async () => {
    const read = vi.spyOn(harness.commands.storage, 'get')
    const panel = await harness.loaded({ mode: FormMode.New })

    await fromForm(panel, {
      type: 'test',
      draft: draft(SHOP, [{ kind: 'password', value: 'typed' }]),
    })

    expect(harness.test.mock.calls.map(([, secrets]) => secrets)).toStrictEqual([
      new Map([[SecretKind.Password, 'typed']]),
    ])
    expect(read).not.toHaveBeenCalled()
  })

  it("should show the server's error", async () => {
    harness.test.mockRejectedValueOnce(new Error('Access denied for user app'))
    const panel = await harness.loaded()

    await fromForm(panel, { type: 'test', draft: draft() })

    expect(sentToForm(panel, 'tested')).toStrictEqual([
      { type: 'tested', isSuccess: false, message: 'Access denied for user app' },
    ])
  })

  it('should not try a draft it finds wrong', async () => {
    const panel = await harness.loaded()

    await fromForm(panel, { type: 'test', draft: draft({ ...SHOP, host: '' }) })

    expect(harness.test).not.toHaveBeenCalled()
    expect(sentToForm(panel, 'tested')).toStrictEqual([
      {
        type: 'tested',
        isSuccess: false,
        message: 'Fix the connection first: Enter the host name or IP address of the server',
      },
    ])
  })

  it('should run one test at a time', async () => {
    const answer = Promise.withResolvers<string>()
    harness.test.mockReturnValueOnce(answer.promise)
    const panel = await harness.loaded()

    panel.webview.send({ type: 'test', draft: draft() })
    await fromForm(panel, { type: 'test', draft: draft() })
    answer.resolve('MySQL 8.4')
    await settled()
    await fromForm(panel, { type: 'test', draft: draft() })

    expect(harness.test).toHaveBeenCalledTimes(2)
    expect(sentToForm(panel, 'tested')).toHaveLength(2)
  })

  it('should keep quiet when the form closed during the test', async () => {
    const answer = Promise.withResolvers<string>()
    harness.test.mockReturnValueOnce(answer.promise)
    const panel = await harness.loaded()

    await fromForm(panel, { type: 'test', draft: draft() })
    panel.dispose()
    answer.resolve('MySQL 8.4')
    await settled()

    expect(sentToForm(panel, 'tested')).toStrictEqual([])
  })
})

describe('saving from the form', () => {
  it('should save the connection of the form, whatever id the form sends', async () => {
    const panel = await harness.loaded({ mode: FormMode.New })

    await fromForm(panel, { type: 'save', draft: draft({ ...SHOP, id: 'other' }) })

    expect(harness.commands.store.list()).toStrictEqual([SHOP])
    expect(panel.isDisposed).toBe(true)
  })

  it('should save once, however many times the form asks', async () => {
    const panel = await harness.loaded({ mode: FormMode.New })

    panel.webview.send({ type: 'save', draft: draft() })
    panel.webview.send({ type: 'save', draft: draft({ ...SHOP, name: 'Again' }) })
    await settled()

    expect(harness.commands.store.list()).toStrictEqual([SHOP])
    expect(window.showInformationMessage).toHaveBeenCalledExactlyOnceWith(
      'Saved the connection "Shop".',
    )
  })

  it('should refuse a draft another connection makes wrong, and save it once fixed', async () => {
    await saved(harness.commands, { ...SHOP, id: 'billing', name: 'Billing' })
    const panel = await harness.loaded({ mode: FormMode.New })

    await fromForm(panel, { type: 'save', draft: draft({ ...SHOP, name: 'billing' }) })

    expect(sentToForm(panel, 'saveRefused')).toStrictEqual([
      {
        type: 'saveRefused',
        message: 'Fix the fields marked in the form, then save again.',
        issues: [{ field: 'name', message: 'Another connection is already named "billing"' }],
      },
    ])
    expect(panel.isDisposed).toBe(false)
    await fromForm(panel, { type: 'save', draft: draft() })
    expect(harness.commands.store.find('shop')).toStrictEqual(SHOP)
  })

  it('should not create again a connection deleted while its form was open', async () => {
    const panel = await harness.loaded({ mode: FormMode.Edit })

    await fromForm(panel, { type: 'save', draft: draft({ ...SHOP, name: 'Renamed' }) })

    expect(sentToForm(panel, 'saveRefused')).toStrictEqual([
      {
        type: 'saveRefused',
        message:
          'The connection "Shop" was deleted while this form was open: sqldoro did not create it again. Close the form, or add it as a new connection.',
        issues: [],
      },
    ])
    expect(harness.commands.store.list()).toStrictEqual([])
  })

  it('should say why the connection could not be saved, and log it', async () => {
    const memento = new FakeMemento()
    await memento.update('sqldoro.connections', { version: 99, connections: [] })
    harness.dispose()
    harness = formHarness({ memento })
    const panel = await harness.loaded({ mode: FormMode.New })

    await fromForm(panel, { type: 'save', draft: draft() })

    const reason =
      'sqldoro cannot change the saved connections because it cannot read them: see the sqldoro output'
    expect(sentToForm(panel, 'saveRefused')).toStrictEqual([
      {
        type: 'saveRefused',
        message: `sqldoro could not save the connection: ${reason}`,
        issues: [],
      },
    ])
    expect(harness.commands.log.error).toHaveBeenCalledWith(
      `Saving the connection "Shop" failed: ${reason}`,
    )
  })
})
