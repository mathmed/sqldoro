import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { saved } from '../../../test/support/commands.ts'
import {
  type FormHarness,
  formHarness,
  formPanels,
  fromForm,
  lastFormPanel,
  formRequest as request,
  sentToForm,
  settled,
  setupOf,
  SHOP,
} from '../../../test/support/forms.ts'
import { answerFiles } from '../../../test/support/prompts.ts'
import { resetVscode, Uri, window } from '../../../test/vscode.ts'
import { FormMode } from '../../core/connection-form/protocol.ts'
import { SecretKind } from '../../core/connection/secrets.ts'

let harness: FormHarness

beforeEach(() => {
  resetVscode()
  window.showOpenDialog.mockReset()
  window.showErrorMessage.mockReset()
  harness = formHarness()
})

afterEach(() => {
  harness.dispose()
})

describe('ConnectionForms', () => {
  it('should open a form in the editor area that keeps its state while hidden', () => {
    const form = harness.forms.open(request())

    expect(form.panel).toMatchObject({
      viewType: 'sqldoro.connectionForm',
      title: 'Edit Connection: Shop',
      showOptions: { viewColumn: -1 },
      webview: {
        options: {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [Uri.file('/ext/dist/webview')],
        },
      },
    })
    const { html } = lastFormPanel().webview
    expect(html).toContain('src="webview:/ext/dist/webview/connection-form.js"')
    expect(html).toContain('href="webview:/ext/dist/webview/connection-form.css"')
    expect(html).toContain("script-src 'nonce-")
    expect(html).toContain('<title>Edit Connection: Shop</title>')
  })

  it('should send the form what it needs as of when it loads, again when it reloads', async () => {
    await saved(harness.commands, { ...SHOP, id: 'other', name: 'Billing' })
    const panel = await harness.loaded({ storedSecrets: new Set([SecretKind.Password]) })

    await fromForm(panel, { type: 'ready' })

    expect(sentToForm(panel, 'open')).toHaveLength(2)
    expect(setupOf(panel)).toStrictEqual({
      mode: 'edit',
      start: 'details',
      connection: SHOP,
      heldSecrets: ['password'],
      engines: [
        { id: 'mysql', displayName: 'MySQL', defaultPort: 3306 },
        { id: 'postgres', displayName: 'PostgreSQL', defaultPort: 5432 },
      ],
      takenNameKeys: ['billing'],
      productionEnvironments: ['prod'],
    })
  })

  it('should close every form it opened', () => {
    harness.forms.open(request())
    harness.forms.openNew(() => request({ mode: FormMode.New, connection: { ...SHOP, id: 'new' } }))

    harness.forms.dispose()

    expect(formPanels()).toStrictEqual([])
  })

  it('should close the form on cancel', async () => {
    const panel = await harness.loaded()

    await fromForm(panel, { type: 'cancel' })

    expect(panel.isDisposed).toBe(true)
  })

  it('should log what the form reports and what it sends that cannot be read', async () => {
    const panel = await harness.loaded()

    await fromForm(panel, {
      type: 'problem',
      message: 'The form received a message it cannot read',
    })
    await fromForm(panel, { type: 'save', draft: { connection: { ...SHOP, port: null } } })

    expect(harness.commands.log.warn).toHaveBeenCalledWith(
      'The form received a message it cannot read',
    )
    expect(harness.commands.log.warn).toHaveBeenCalledWith(
      'The connection form sent a message sqldoro cannot read: "secretChanges" must be a list',
    )
  })

  it('should log and show a failure it did not expect', async () => {
    const panel = await harness.loaded()
    window.showOpenDialog.mockRejectedValueOnce(new Error('dialog crashed'))

    await fromForm(panel, { type: 'browse', field: 'sslCaPath' })

    expect(harness.commands.log.error).toHaveBeenCalledWith(
      'The connection form failed: dialog crashed',
    )
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'The connection form failed: dialog crashed',
    )
  })

  it('should let other errors of reading a message through', async () => {
    const form = harness.forms.open(request())
    const exploding = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('broken message')
        },
      },
    )

    await expect(form.receive(exploding)).rejects.toThrow('broken message')
  })
})

describe('Browse', () => {
  it('should send the form the file the user chose for a field', async () => {
    const panel = await harness.loaded()
    answerFiles('/certs/ca.pem', undefined)

    await fromForm(panel, { type: 'browse', field: 'sslCaPath' })
    await fromForm(panel, { type: 'browse', field: 'sshPrivateKeyPath' })

    expect(window.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'CA certificate', canSelectFiles: true }),
    )
    expect(window.showOpenDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Private key' }),
    )
    expect(sentToForm(panel, 'file')).toStrictEqual([
      { type: 'file', field: 'sslCaPath', path: '/certs/ca.pem' },
    ])
  })

  it('should open one file dialog at a time', async () => {
    const panel = await harness.loaded()
    const chosen = Promise.withResolvers<{ fsPath: string }[]>()
    window.showOpenDialog.mockReturnValueOnce(chosen.promise)

    panel.webview.send({ type: 'browse', field: 'sslKeyPath' })
    await fromForm(panel, { type: 'browse', field: 'sslKeyPath' })
    chosen.resolve([{ fsPath: '/key.pem' }])
    await settled()

    expect(window.showOpenDialog).toHaveBeenCalledOnce()
    expect(sentToForm(panel, 'file')).toHaveLength(1)
  })
})
