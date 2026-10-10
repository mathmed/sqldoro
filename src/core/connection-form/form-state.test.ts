import { describe, expect, it } from 'vitest'

import {
  formSetup,
  NEW_CONNECTION,
  openedForm as opened,
  validForm as valid,
} from '../../../test/fixtures/connection-form.ts'
import { DEFAULT_SSH_TUNNEL } from '../connection/connection.ts'
import { SecretKind } from '../connection/secrets.ts'
import { PathField } from '../connection/transitions.ts'
import { ConnectionField } from '../connection/validation.ts'
import {
  chooseFile,
  ConfigTab,
  editConnection,
  issuesOf,
  keepSecret,
  openForm,
  policyOf,
  receiveHostMessage,
  removeSecret,
  selectTab,
  shownIssues,
  tabsWithIssues,
  TestState,
  touchField,
  typeSecret,
  updateForm,
} from './form-state.ts'

const NAME_ISSUE = { field: ConnectionField.Name, message: 'Enter a name for the connection' }
const USER_ISSUE = { field: ConnectionField.User, message: 'Enter the user to log in as' }
const CONFLICT = { field: ConnectionField.Name, message: 'Another connection is named "Shop"' }

describe('openForm', () => {
  it('should open on the main tab with the name in focus and nothing to say yet', () => {
    const setup = formSetup({ heldSecrets: [SecretKind.Password] })

    expect(openForm(setup)).toStrictEqual({
      setup,
      draft: {
        connection: NEW_CONNECTION,
        secretChanges: new Map(),
        heldSecrets: new Set([SecretKind.Password]),
      },
      touched: new Set(),
      isShowingAllIssues: false,
      hostIssues: [],
      activeTab: ConfigTab.Main,
      test: { state: TestState.Idle, message: '' },
      isSaving: false,
      notice: '',
      submission: null,
      focus: { field: ConnectionField.Name },
    })
  })
})

describe('receiveHostMessage', () => {
  it('should open the form, again when the extension sends it again', () => {
    const setup = formSetup()

    expect(receiveHostMessage(null, { type: 'open', setup })).toStrictEqual(openForm(setup))
    expect(
      receiveHostMessage(opened({ activeTab: ConfigTab.Ssh }), { type: 'open', setup }),
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
    expect(
      receiveHostMessage(testing, { type: 'tested', isSuccess: false, message: 'refused' })?.test,
    ).toStrictEqual({ state: TestState.Failed, message: 'refused' })
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
})

describe('updateForm', () => {
  it('should change an open form, and nothing before it opens', () => {
    expect(updateForm(null, (state) => selectTab(state, ConfigTab.Ssh))).toBeNull()
    expect(updateForm(opened(), (state) => selectTab(state, ConfigTab.Ssh))?.activeTab).toBe(
      ConfigTab.Ssh,
    )
  })
})

describe('policyOf', () => {
  it('should treat the environments of the settings as production', () => {
    expect(policyOf(formSetup())).toStrictEqual({
      productionEnvironments: new Set(['prod', 'staging']),
    })
  })
})

describe('issuesOf and shownIssues', () => {
  it('should find the problems of the connection, then those the extension reported', () => {
    expect(issuesOf(opened({ hostIssues: [CONFLICT] }))).toStrictEqual([
      NAME_ISSUE,
      USER_ISSUE,
      CONFLICT,
    ])
  })

  it('should find a name another connection has', () => {
    const sut = editConnection(valid(), null, (connection) => ({ ...connection, name: 'Billing' }))

    expect(issuesOf(sut)).toStrictEqual([
      { field: ConnectionField.Name, message: 'Another connection is already named "Billing"' },
    ])
  })

  it('should show nothing before the user touches a field', () => {
    expect(shownIssues(opened())).toStrictEqual(new Map())
  })

  it('should show the first problem of the fields the user touched', () => {
    const sut = touchField(opened({ hostIssues: [CONFLICT] }), ConnectionField.Name)

    expect(shownIssues(sut)).toStrictEqual(new Map([[ConnectionField.Name, NAME_ISSUE.message]]))
  })

  it('should show every problem once the user tried to test or save', () => {
    expect(shownIssues(opened({ isShowingAllIssues: true }))).toStrictEqual(
      new Map([
        [ConnectionField.Name, NAME_ISSUE.message],
        [ConnectionField.User, USER_ISSUE.message],
      ]),
    )
  })
})

describe('tabsWithIssues', () => {
  it('should name the tabs whose fields show a problem', () => {
    const shown = new Map([
      [ConnectionField.Name, 'a'],
      [ConnectionField.SshHost, 'b'],
      [ConnectionField.SslKeyPath, 'c'],
      [ConnectionField.SshUser, 'd'],
    ])

    expect(tabsWithIssues(shown)).toStrictEqual(new Set([ConfigTab.Ssh, ConfigTab.Ssl]))
    expect(tabsWithIssues(new Map())).toStrictEqual(new Set())
  })

  it('should put every field on its tab', () => {
    const fields = Object.values(ConnectionField)

    expect(fields.map((field) => [...tabsWithIssues(new Map([[field, 'x']]))])).toStrictEqual([
      [],
      [],
      ...Array.from({ length: 4 }, () => [ConfigTab.Main]),
      ...Array.from({ length: 4 }, () => [ConfigTab.Ssl]),
      ...Array.from({ length: 4 }, () => [ConfigTab.Ssh]),
    ])
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

  it('should forget what the extension said and what a finished test said', () => {
    const refused = opened({
      hostIssues: [CONFLICT],
      notice: 'refused',
      test: { state: TestState.Failed, message: 'down' },
    })

    expect(editConnection(refused, null, (c) => c)).toMatchObject({
      hostIssues: [],
      notice: '',
      test: { state: TestState.Idle, message: '' },
    })
    expect(typeSecret(refused, SecretKind.Password, 'x')).toMatchObject({ hostIssues: [] })
  })

  it('should keep waiting for a test that runs', () => {
    const testing = opened({ test: { state: TestState.Testing, message: '' } })

    expect(editConnection(testing, null, (c) => c).test).toBe(testing.test)
  })

  it('should choose and remove a file', () => {
    const chosen = chooseFile(opened(), PathField.SshPrivateKey, '/id')

    expect(chosen.draft.connection.ssh).toStrictEqual({
      ...DEFAULT_SSH_TUNNEL,
      privateKeyPath: '/id',
    })
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

  it('should bring a tab to the front', () => {
    expect(selectTab(opened(), ConfigTab.Ssl).activeTab).toBe(ConfigTab.Ssl)
  })
})
