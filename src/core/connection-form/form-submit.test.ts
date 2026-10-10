import { describe, expect, it } from 'vitest'

import {
  openedForm as opened,
  validForm as valid,
  VALID_CONNECTION,
} from '../../../test/fixtures/connection-form.ts'
import { DEFAULT_SSH_TUNNEL, DEFAULT_SSL, SslMode } from '../connection/connection.ts'
import { SecretKind } from '../connection/secrets.ts'
import { ConnectionField } from '../connection/validation.ts'
import { shownIssues } from './form-issues.ts'
import {
  editConnection,
  FormAction,
  ListingState,
  NO_DATABASES,
  TestState,
  typeSecret,
} from './form-state.ts'
import { canSubmit, finishTest, refuseSave, submit } from './form-submit.ts'

const CONFLICT = { field: ConnectionField.Name, message: 'Another connection is named "Shop"' }
const TESTING = { state: TestState.Testing, message: '' }
const LISTING = { ...NO_DATABASES, state: ListingState.Listing }

describe('canSubmit', () => {
  it('should send nothing while a save runs', () => {
    const saving = opened({ isSaving: true })

    expect(Object.values(FormAction).map((action) => canSubmit(saving, action))).toStrictEqual([
      false,
      false,
      false,
    ])
  })

  it('should wait for a test that runs before another, not before anything else', () => {
    const testing = opened({ test: TESTING })

    expect(canSubmit(testing, FormAction.Test)).toBe(false)
    expect(canSubmit(testing, FormAction.Save)).toBe(true)
    expect(canSubmit(testing, FormAction.ListDatabases)).toBe(true)
    expect(canSubmit(opened(), FormAction.Test)).toBe(true)
  })

  it('should wait for a listing that runs before another, not before anything else', () => {
    const listing = opened({ databases: LISTING })

    expect(canSubmit(listing, FormAction.ListDatabases)).toBe(false)
    expect(canSubmit(listing, FormAction.Test)).toBe(true)
    expect(canSubmit(opened(), FormAction.ListDatabases)).toBe(true)
  })
})

describe('submit', () => {
  it('should save a valid draft with the secrets typed for it', () => {
    const typed = typeSecret(valid(), SecretKind.SshPassword, 'unused')
    const sut = submit(typeSecret(typed, SecretKind.Password, 'new'), FormAction.Save)

    expect(sut).toMatchObject({ isSaving: true, notice: '' })
    expect(sut.submission).toStrictEqual({
      type: 'save',
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

    expect(sut.test).toStrictEqual(TESTING)
    expect(sut.submission).toStrictEqual({
      type: 'test',
      draft: { connection: { ...VALID_CONNECTION, name: '' }, secretChanges: [] },
    })
    expect(sut.isSaving).toBe(false)
    expect(sut.databases).toBe(NO_DATABASES)
  })

  it('should list the databases of the server of a draft without a name', () => {
    const unnamed = editConnection(valid(), null, (connection) => ({ ...connection, name: '' }))
    const sut = submit(typeSecret(unnamed, SecretKind.Password, 'pw'), FormAction.ListDatabases)

    expect(sut.databases).toStrictEqual(LISTING)
    expect(sut.submission).toStrictEqual({
      type: 'listDatabases',
      draft: {
        connection: { ...VALID_CONNECTION, name: '' },
        secretChanges: [{ kind: SecretKind.Password, value: 'pw' }],
      },
    })
    expect(sut.test).toStrictEqual({ state: TestState.Idle, message: '' })
    expect(sut.isSaving).toBe(false)
  })

  it('should show every problem and take the user to the first one going down the form', () => {
    const ssl = { ...DEFAULT_SSL, caPath: '/ca' }
    const ssh = { ...DEFAULT_SSH_TUNNEL, host: 'bastion' }
    const broken = editConnection(opened(), null, (connection) => ({ ...connection, ssh, ssl }))

    const sut = submit(broken, FormAction.Save)

    expect(sut).toMatchObject({
      isShowingAllIssues: true,
      isAdvancedOpen: true,
      focus: { field: ConnectionField.Name },
      isSaving: false,
      submission: null,
    })
    expect(submit(broken, FormAction.Test)).toMatchObject({
      focus: { field: ConnectionField.User },
      test: { state: TestState.Idle },
    })
    expect(submit(broken, FormAction.ListDatabases)).toMatchObject({
      focus: { field: ConnectionField.User },
      databases: NO_DATABASES,
    })
  })

  it('should take the user to the tunnel before the SSL settings', () => {
    const broken = editConnection(valid(), null, (connection) => ({
      ...connection,
      ssl: { ...DEFAULT_SSL, mode: SslMode.Require, keyPath: '/key' },
      ssh: { ...DEFAULT_SSH_TUNNEL, user: 'ops' },
    }))

    expect(submit(broken, FormAction.Save)).toMatchObject({
      isAdvancedOpen: true,
      focus: { field: ConnectionField.SshHost },
    })
  })

  it('should send nothing twice', () => {
    const saving = submit(valid(), FormAction.Save)
    const testing = submit(valid(), FormAction.Test)
    const listing = submit(valid(), FormAction.ListDatabases)

    expect(submit(saving, FormAction.Save)).toBe(saving)
    expect(submit(testing, FormAction.Test)).toBe(testing)
    expect(submit(listing, FormAction.ListDatabases)).toBe(listing)
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
    const saving = submit(valid(), FormAction.Save)

    expect(refuseSave(saving, 'It was deleted', [])).toMatchObject({
      isSaving: false,
      notice: 'It was deleted',
      hostIssues: [],
      isShowingAllIssues: false,
      focus: { field: ConnectionField.Name },
    })
  })

  it('should show the fields at fault and take the user to the first one', () => {
    const saving = submit(valid(), FormAction.Save)
    const hostIssue = { field: ConnectionField.Host, message: 'Unreachable' }

    const sut = refuseSave(saving, 'Fix the connection first', [hostIssue, CONFLICT])

    expect(sut).toMatchObject({
      isSaving: false,
      isShowingAllIssues: true,
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
