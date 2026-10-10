import { describe, expect, it } from 'vitest'

import {
  openedForm as opened,
  validForm as valid,
  VALID_CONNECTION,
} from '../../../test/fixtures/connection-form.ts'
import { DEFAULT_SSH_TUNNEL } from '../connection/connection.ts'
import { SecretKind } from '../connection/secrets.ts'
import { ConnectionField } from '../connection/validation.ts'
import {
  blockingIssues,
  canSubmit,
  ConfigTab,
  editConnection,
  finishTest,
  FormAction,
  refuseSave,
  selectTab,
  shownIssues,
  submit,
  TestState,
  typeSecret,
} from './form-state.ts'

const NAME_ISSUE = { field: ConnectionField.Name, message: 'Enter a name for the connection' }
const USER_ISSUE = { field: ConnectionField.User, message: 'Enter the user to log in as' }
const CONFLICT = { field: ConnectionField.Name, message: 'Another connection is named "Shop"' }

describe('blockingIssues', () => {
  it('should let a connection without a name be tested, not saved', () => {
    expect(blockingIssues([NAME_ISSUE, USER_ISSUE], FormAction.Save)).toStrictEqual([
      NAME_ISSUE,
      USER_ISSUE,
    ])
    expect(blockingIssues([NAME_ISSUE, USER_ISSUE], FormAction.Test)).toStrictEqual([USER_ISSUE])
  })
})

describe('canSubmit', () => {
  it('should send nothing while a save runs', () => {
    expect(canSubmit(opened({ isSaving: true }), FormAction.Save)).toBe(false)
    expect(canSubmit(opened({ isSaving: true }), FormAction.Test)).toBe(false)
  })

  it('should wait for a test that runs before another, not before a save', () => {
    const testing = opened({ test: { state: TestState.Testing, message: '' } })

    expect(canSubmit(testing, FormAction.Test)).toBe(false)
    expect(canSubmit(testing, FormAction.Save)).toBe(true)
    expect(canSubmit(opened(), FormAction.Test)).toBe(true)
  })
})

describe('submit', () => {
  it('should save a valid draft with the secrets typed for it', () => {
    const typed = typeSecret(valid(), SecretKind.SshPassword, 'unused')
    const sut = submit(typeSecret(typed, SecretKind.Password, 'new'), FormAction.Save)

    expect(sut).toMatchObject({ isSaving: true, notice: '' })
    expect(sut.submission).toStrictEqual({
      action: FormAction.Save,
      draft: {
        connection: VALID_CONNECTION,
        secretChanges: [{ kind: SecretKind.Password, value: 'new' }],
      },
    })
  })

  it('should forget the notice of a refused save when saving again', () => {
    expect(submit({ ...valid(), notice: 'refused' }, FormAction.Save).notice).toBe('')
  })

  it('should test a draft without a name', () => {
    const unnamed = editConnection(valid(), null, (connection) => ({ ...connection, name: '' }))
    const sut = submit(unnamed, FormAction.Test)

    expect(sut.test).toStrictEqual({ state: TestState.Testing, message: '' })
    expect(sut.submission).toStrictEqual({
      action: FormAction.Test,
      draft: { connection: { ...VALID_CONNECTION, name: '' }, secretChanges: [] },
    })
    expect(sut.isSaving).toBe(false)
  })

  it('should show every problem, bring the first tab with one and focus the first field', () => {
    const ssh = { ...DEFAULT_SSH_TUNNEL, host: 'bastion' }
    const broken = editConnection(opened({ activeTab: ConfigTab.Ssl }), null, (connection) => ({
      ...connection,
      ssh,
    }))

    const sut = submit(broken, FormAction.Save)

    expect(sut).toMatchObject({
      isShowingAllIssues: true,
      activeTab: ConfigTab.Main,
      focus: { field: ConnectionField.Name },
      isSaving: false,
      submission: null,
    })
    expect(submit(broken, FormAction.Test)).toMatchObject({
      activeTab: ConfigTab.Main,
      focus: { field: ConnectionField.User },
      test: { state: TestState.Idle },
    })
  })

  it('should keep the tab in front when only the name has a problem', () => {
    const unnamed = editConnection(valid(), null, (connection) => ({ ...connection, name: '' }))

    expect(submit(selectTab(unnamed, ConfigTab.Ssh), FormAction.Save)).toMatchObject({
      activeTab: ConfigTab.Ssh,
      focus: { field: ConnectionField.Name },
    })
  })

  it('should take the user to the SSH tab for a tunnel without its server', () => {
    const tunnel = editConnection(valid(), null, (connection) => ({
      ...connection,
      ssh: { ...DEFAULT_SSH_TUNNEL, user: 'ops' },
    }))

    expect(submit(tunnel, FormAction.Save)).toMatchObject({
      activeTab: ConfigTab.Ssh,
      focus: { field: ConnectionField.SshHost },
    })
  })

  it('should send nothing twice', () => {
    const saving = submit(valid(), FormAction.Save)
    const testing = submit(valid(), FormAction.Test)

    expect(submit(saving, FormAction.Save)).toBe(saving)
    expect(submit(testing, FormAction.Test)).toBe(testing)
  })
})

describe('finishTest', () => {
  it('should keep what the server said', () => {
    expect(finishTest(opened(), true, 'MySQL 8.4').test).toStrictEqual({
      state: TestState.Succeeded,
      message: 'MySQL 8.4',
    })
    expect(finishTest(opened(), false, 'refused').test).toStrictEqual({
      state: TestState.Failed,
      message: 'refused',
    })
  })
})

describe('refuseSave', () => {
  it('should say why without moving the user when no field is at fault', () => {
    const saving = submit(selectTab(valid(), ConfigTab.Ssl), FormAction.Save)

    expect(refuseSave(saving, 'It was deleted', [])).toMatchObject({
      isSaving: false,
      notice: 'It was deleted',
      hostIssues: [],
      isShowingAllIssues: false,
      activeTab: ConfigTab.Ssl,
    })
  })

  it('should show the fields at fault and take the user to the first one', () => {
    const saving = submit(selectTab(valid(), ConfigTab.Ssl), FormAction.Save)
    const hostIssue = { field: ConnectionField.Host, message: 'Unreachable' }

    const sut = refuseSave(saving, 'Fix the connection first', [CONFLICT, hostIssue])

    expect(sut).toMatchObject({
      isSaving: false,
      isShowingAllIssues: true,
      activeTab: ConfigTab.Main,
      focus: { field: ConnectionField.Name },
    })
    expect(shownIssues(sut)).toStrictEqual(
      new Map([
        [ConnectionField.Name, CONFLICT.message],
        [ConnectionField.Host, 'Unreachable'],
      ]),
    )
  })
})
