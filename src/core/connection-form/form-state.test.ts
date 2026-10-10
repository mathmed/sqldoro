import { describe, expect, it } from 'vitest'

import {
  formSetup,
  NEW_CONNECTION,
  openedForm as opened,
  validForm as valid,
} from '../../../test/fixtures/connection-form.ts'
import { DEFAULT_SSH_TUNNEL, DEFAULT_SSL, SslMode } from '../connection/connection.ts'
import { SecretKind } from '../connection/secrets.ts'
import { PathField } from '../connection/transitions.ts'
import { ConnectionField } from '../connection/validation.ts'
import {
  changed,
  chooseFile,
  CLOSED_IMPORT,
  editConnection,
  FormControl,
  FormStep,
  keepSecret,
  ListingState,
  NO_DATABASES,
  openForm,
  policyOf,
  removeSecret,
  TestState,
  touchField,
  typeSecret,
  updateForm,
  usesSsl,
} from './form-state.ts'
import { FormStart } from './protocol.ts'

const CONFLICT = { field: ConnectionField.Name, message: 'Another connection is named "Shop"' }
const LISTED = { state: ListingState.Listed, names: ['shop'], message: '', isOpen: true }

describe('openForm', () => {
  it('should open on the fields with the name in focus and nothing to say yet', () => {
    const setup = formSetup({ heldSecrets: [SecretKind.Password] })

    expect(openForm(setup)).toStrictEqual({
      setup,
      step: FormStep.Details,
      draft: {
        connection: NEW_CONNECTION,
        secretChanges: new Map(),
        heldSecrets: new Set([SecretKind.Password]),
        urlSecrets: new Set(),
      },
      touched: new Set(),
      isShowingAllIssues: false,
      hostIssues: [],
      isAdvancedOpen: false,
      importer: { isOpen: false, text: '', isApplying: false, problem: '', warnings: [] },
      databases: { state: ListingState.Idle, names: [], message: '', isOpen: false },
      test: { state: TestState.Idle, message: '' },
      isSaving: false,
      notice: '',
      submission: null,
      focus: { field: ConnectionField.Name },
    })
  })

  it('should open on the engines with the engine in focus', () => {
    expect(openForm(formSetup({ start: FormStart.Picker }))).toMatchObject({
      step: FormStep.Picker,
      importer: CLOSED_IMPORT,
      focus: { field: ConnectionField.Engine },
    })
  })

  it('should open on the input of a connection string, in focus', () => {
    expect(openForm(formSetup({ start: FormStart.Import }))).toMatchObject({
      step: FormStep.Details,
      importer: { ...CLOSED_IMPORT, isOpen: true },
      focus: { field: FormControl.ConnectionString },
    })
  })

  it('should open the SSL settings of a connection that uses SSL', () => {
    const ssl = { ...DEFAULT_SSL, mode: SslMode.Require }

    expect(openForm(formSetup({ connection: { ...NEW_CONNECTION, ssl } })).isAdvancedOpen).toBe(
      true,
    )
  })
})

describe('usesSsl', () => {
  it('should tell SSL on, or certificate files without it, from no SSL at all', () => {
    expect(usesSsl(DEFAULT_SSL)).toBe(false)
    expect(usesSsl({ ...DEFAULT_SSL, mode: SslMode.VerifyCa })).toBe(true)
    expect(usesSsl({ ...DEFAULT_SSL, caPath: '/ca' })).toBe(true)
    expect(usesSsl({ ...DEFAULT_SSL, certPath: '/cert' })).toBe(true)
    expect(usesSsl({ ...DEFAULT_SSL, keyPath: '/key' })).toBe(true)
  })
})

describe('updateForm', () => {
  it('should change an open form, and nothing before it opens', () => {
    const toPicker = (state: ReturnType<typeof opened>): ReturnType<typeof opened> => ({
      ...state,
      step: FormStep.Picker,
    })

    expect(updateForm(null, toPicker)).toBeNull()
    expect(updateForm(opened(), toPicker)?.step).toBe(FormStep.Picker)
  })
})

describe('policyOf', () => {
  it('should treat the environments of the settings as production', () => {
    expect(policyOf(formSetup())).toStrictEqual({
      productionEnvironments: new Set(['prod', 'staging']),
    })
  })
})

describe('editing', () => {
  it('should change the connection and touch the field', () => {
    const sut = editConnection(opened(), ConnectionField.Host, (connection) => ({
      ...connection,
      host: 'db',
    }))

    expect(sut.draft.connection.host).toBe('db')
    expect(sut.touched).toStrictEqual(new Set([ConnectionField.Host]))
  })

  it('should touch no field for a change without one', () => {
    const sut = editConnection(opened({ touched: new Set([ConnectionField.Name]) }), null, (c) => c)

    expect(sut.touched).toStrictEqual(new Set([ConnectionField.Name]))
  })

  it('should forget what the extension said and what a finished test or listing said', () => {
    const refused = opened({
      hostIssues: [CONFLICT],
      notice: 'refused',
      test: { state: TestState.Failed, message: 'down' },
      databases: LISTED,
    })

    expect(editConnection(refused, null, (c) => c)).toMatchObject({
      hostIssues: [],
      notice: '',
      test: { state: TestState.Idle, message: '' },
      databases: NO_DATABASES,
    })
    expect(typeSecret(refused, SecretKind.Password, 'x')).toMatchObject({
      hostIssues: [],
      databases: NO_DATABASES,
    })
  })

  it('should keep waiting for a test or a listing that runs', () => {
    const running = opened({
      test: { state: TestState.Testing, message: '' },
      databases: { ...NO_DATABASES, state: ListingState.Listing },
    })

    const sut = editConnection(running, ConnectionField.Host, (c) => c)

    expect(sut.test).toBe(running.test)
    expect(sut.databases).toBe(running.databases)
  })

  it('should keep the databases listed while the user types the one to open', () => {
    const listed = opened({ databases: LISTED })
    const failed = opened({ databases: { ...NO_DATABASES, state: ListingState.Failed } })

    expect(changed(listed, ConnectionField.Database).databases).toBe(LISTED)
    expect(changed(listed, ConnectionField.User).databases).toBe(NO_DATABASES)
    expect(changed(failed, ConnectionField.Database).databases).toBe(NO_DATABASES)
  })

  it('should choose and remove a file', () => {
    const chosen = chooseFile(opened(), PathField.SshPrivateKey, '/id')

    expect(chosen.draft.connection.ssh).toStrictEqual({
      ...DEFAULT_SSH_TUNNEL,
      privateKeyPath: '/id',
    })
    expect(chosen.touched).toStrictEqual(new Set([ConnectionField.SshPrivateKeyPath]))
    expect(chooseFile(chosen, PathField.SshPrivateKey, '').draft.connection.ssh).toStrictEqual(
      DEFAULT_SSH_TUNNEL,
    )
  })

  it('should type, remove and keep a secret', () => {
    const typed = typeSecret(valid(), SecretKind.Password, 'new')
    const removed = removeSecret(typed, SecretKind.Password)

    expect(typed.draft.secretChanges).toStrictEqual(new Map([[SecretKind.Password, 'new']]))
    expect(removed.draft.secretChanges).toStrictEqual(new Map([[SecretKind.Password, '']]))
    expect(keepSecret(removed, SecretKind.Password).draft.secretChanges).toStrictEqual(new Map())
    expect(removed.touched).toStrictEqual(new Set())
  })

  it('should touch a field once', () => {
    const touched = touchField(opened(), ConnectionField.Port)

    expect(touched.touched).toStrictEqual(new Set([ConnectionField.Port]))
    expect(touchField(touched, ConnectionField.Port)).toBe(touched)
  })
})
