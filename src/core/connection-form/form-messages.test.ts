import { describe, expect, it } from 'vitest'

import {
  formSetup,
  NEW_CONNECTION,
  openedForm as opened,
} from '../../../test/fixtures/connection-form.ts'
import { SecretKind } from '../connection/secrets.ts'
import { PathField } from '../connection/transitions.ts'
import { ConnectionField } from '../connection/validation.ts'
import { receiveHostMessage } from './form-messages.ts'
import {
  FormControl,
  FormStep,
  ListingState,
  NO_DATABASES,
  openForm,
  TestState,
} from './form-state.ts'
import { FormStart } from './protocol.ts'

const CONFLICT = { field: ConnectionField.Name, message: 'Another connection is named "Shop"' }

describe('receiveHostMessage', () => {
  it('should open the form, again when the extension sends it again', () => {
    const setup = formSetup()

    expect(receiveHostMessage(null, { type: 'open', setup })).toStrictEqual(openForm(setup))
    expect(
      receiveHostMessage(opened({ isAdvancedOpen: true }), { type: 'open', setup }),
    ).toStrictEqual(openForm(setup))
  })

  it('should wait for the form to open before anything else', () => {
    expect(receiveHostMessage(null, { type: 'tested', isSuccess: true, message: 'ok' })).toBeNull()
  })

  it('should put a chosen file in its field', () => {
    const sut = receiveHostMessage(opened(), {
      type: 'file',
      field: PathField.SslCa,
      path: '/ca.pem',
    })

    expect(sut?.draft.connection.ssl.caPath).toBe('/ca.pem')
    expect(sut?.touched).toStrictEqual(new Set([ConnectionField.SslCaPath]))
  })

  it('should show how a test went', () => {
    const testing = opened({ test: { state: TestState.Testing, message: '' } })

    expect(
      receiveHostMessage(testing, { type: 'tested', isSuccess: true, message: 'MySQL 8.4' })?.test,
    ).toStrictEqual({ state: TestState.Succeeded, message: 'MySQL 8.4' })
  })

  it('should show why the extension did not save', () => {
    const sut = receiveHostMessage(opened({ isSaving: true }), {
      type: 'saveRefused',
      message: 'Fix the connection first',
      issues: [CONFLICT],
    })

    expect(sut).toMatchObject({ isSaving: false, notice: 'Fix the connection first' })
    expect(sut?.hostIssues).toStrictEqual([CONFLICT])
  })

  it('should open the input of a connection string when the extension asks', () => {
    const picker = openForm(formSetup({ start: FormStart.Picker }))

    expect(receiveHostMessage(picker, { type: 'showImport' })).toMatchObject({
      step: FormStep.Details,
      importer: { isOpen: true },
      focus: { field: FormControl.ConnectionString },
    })
  })

  it('should fill the form with what a connection string holds', () => {
    const sut = receiveHostMessage(opened(), {
      type: 'imported',
      connection: { ...NEW_CONNECTION, host: 'db.example.com' },
      urlSecrets: [SecretKind.Password],
      warnings: ['w'],
    })

    expect(sut?.draft.connection.host).toBe('db.example.com')
    expect(sut?.draft.urlSecrets).toStrictEqual(new Set([SecretKind.Password]))
    expect(sut?.importer.warnings).toStrictEqual(['w'])
  })

  it('should say why a connection string was refused', () => {
    expect(
      receiveHostMessage(opened(), { type: 'importRefused', message: 'Bad URL' })?.importer.problem,
    ).toBe('Bad URL')
  })

  it('should show the databases of the server, or why they could not be listed', () => {
    const listing = opened({ databases: { ...NO_DATABASES, state: ListingState.Listing } })

    expect(
      receiveHostMessage(listing, { type: 'databases', names: ['shop'] })?.databases,
    ).toStrictEqual({ state: ListingState.Listed, names: ['shop'], message: '', isOpen: true })
    expect(
      receiveHostMessage(listing, { type: 'databasesFailed', message: 'denied' })?.databases,
    ).toStrictEqual({ ...NO_DATABASES, state: ListingState.Failed, message: 'denied' })
  })
})
