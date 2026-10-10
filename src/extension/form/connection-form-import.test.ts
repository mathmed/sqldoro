import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { saved } from '../../../test/support/commands.ts'
import {
  submittedDraft as draft,
  type FormHarness,
  formHarness,
  formRequest,
  fromForm,
  lastFormPanel,
  sentToForm,
  setupOf,
  SHOP,
} from '../../../test/support/forms.ts'
import { resetVscode } from '../../../test/vscode.ts'
import { FormMode } from '../../core/connection-form/protocol.ts'
import { SecretKind } from '../../core/connection/secrets.ts'

let harness: FormHarness

beforeEach(() => {
  resetVscode()
  harness = formHarness()
})

afterEach(() => {
  harness.dispose()
})

describe('importing a connection string in the form', () => {
  it('should send the form what the URL holds for its connection, and keep the password', async () => {
    await saved(harness.commands, { ...SHOP, id: 'billing', name: 'db.example.com/shop' })
    const panel = await harness.loaded({ mode: FormMode.New })

    await fromForm(panel, {
      type: 'import',
      text: 'postgresql://app:pa55@db.example.com/shop?connect_timeout=5',
    })

    expect(sentToForm(panel, 'imported')).toMatchObject([
      {
        type: 'imported',
        connection: {
          id: 'shop',
          name: 'db.example.com/shop (2)',
          engine: 'postgres',
          host: 'db.example.com',
          user: 'app',
          database: 'shop',
        },
        urlSecrets: ['password'],
        warnings: ['Ignored the URL parameter "connect_timeout"'],
      },
    ])
    expect(JSON.stringify(panel.webview.posted)).not.toContain('pa55')
  })

  it('should save the password of the URL unless the form replaces it', async () => {
    const panel = await harness.loaded({ mode: FormMode.New })
    await fromForm(panel, { type: 'import', text: 'mysql://app:pa55@localhost/shop' })

    await fromForm(panel, { type: 'save', draft: draft() })

    expect(harness.commands.storage.values).toStrictEqual(
      new Map([['sqldoro.connection.shop.password', 'pa55']]),
    )
  })

  it('should forget the password of an earlier URL, and of a form that loads again', async () => {
    await saved(harness.commands, SHOP, new Map([[SecretKind.Password, 'stored']]))
    const panel = await harness.loaded()
    await fromForm(panel, { type: 'import', text: 'mysql://app:one@localhost/shop' })
    await fromForm(panel, { type: 'test', draft: draft() })
    await fromForm(panel, { type: 'import', text: 'mysql://app@localhost/shop' })
    await fromForm(panel, { type: 'test', draft: draft() })
    await fromForm(panel, { type: 'import', text: 'mysql://app:two@localhost/shop' })
    await fromForm(panel, { type: 'ready' })
    await fromForm(panel, { type: 'test', draft: draft() })

    expect(harness.test.mock.calls.map(([, secrets]) => secrets)).toStrictEqual([
      new Map([[SecretKind.Password, 'one']]),
      new Map([[SecretKind.Password, 'stored']]),
      new Map([[SecretKind.Password, 'stored']]),
    ])
    expect(sentToForm(panel, 'imported')[1]).toMatchObject({ urlSecrets: [] })
  })

  it('should say why a URL cannot be imported', async () => {
    const panel = await harness.loaded({ mode: FormMode.New })

    await fromForm(panel, { type: 'import', text: 'mongodb://db' })

    expect(sentToForm(panel, 'importRefused')).toStrictEqual([
      {
        type: 'importRefused',
        message: 'Unsupported URL scheme "mongodb": use mysql://, postgres:// or postgresql://',
      },
    ])
  })
})

describe('showImport', () => {
  it('should open the input of a connection string in a form that is loaded', async () => {
    const form = harness.forms.open(formRequest({ mode: FormMode.New }))
    const panel = lastFormPanel()
    await fromForm(panel, { type: 'ready' })

    form.showImport()

    expect(sentToForm(panel, 'showImport')).toStrictEqual([{ type: 'showImport' }])
    expect(setupOf(panel)).toMatchObject({ start: 'details' })
  })

  it('should open a form that is still loading on the input of a connection string', async () => {
    const form = harness.forms.open(formRequest({ mode: FormMode.New }))
    const panel = lastFormPanel()

    form.showImport()
    await fromForm(panel, { type: 'ready' })

    expect(sentToForm(panel, 'showImport')).toStrictEqual([])
    expect(setupOf(panel)).toMatchObject({ start: 'import' })
  })
})
