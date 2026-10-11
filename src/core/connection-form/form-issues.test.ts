import { describe, expect, it } from 'vitest'

import { openedForm as opened, validForm as valid } from '../../../test/fixtures/connection-form.ts'
import { ConnectionField } from '../connection/validation.ts'
import {
  blockingIssues,
  firstIssue,
  hasAdvancedIssues,
  issuesOf,
  showIssues,
  shownIssues,
} from './form-issues.ts'
import { editConnection, FormAction, touchField } from './form-state.ts'

const NAME_ISSUE = { field: ConnectionField.Name, message: 'Enter a name for the connection' }
const USER_ISSUE = { field: ConnectionField.User, message: 'Enter the user to log in as' }
const CONFLICT = { field: ConnectionField.Name, message: 'Another connection is named "Shop"' }

function issue(field: ConnectionField): {
  readonly field: ConnectionField
  readonly message: string
} {
  return { field, message: field }
}

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

describe('hasAdvancedIssues', () => {
  it('should find a problem among the SSL fields only', () => {
    const outside = [
      ConnectionField.Name,
      ConnectionField.Engine,
      ConnectionField.Host,
      ConnectionField.Port,
      ConnectionField.User,
      ConnectionField.Database,
      ConnectionField.SshHost,
      ConnectionField.SshPort,
      ConnectionField.SshUser,
      ConnectionField.SshPrivateKeyPath,
    ]
    const inside = [
      ConnectionField.SslMode,
      ConnectionField.SslCaPath,
      ConnectionField.SslCertPath,
      ConnectionField.SslKeyPath,
    ]

    expect(hasAdvancedIssues(new Map(outside.map((field) => [field, 'x'])))).toBe(false)
    expect(hasAdvancedIssues(new Map([...outside, ...inside].map((field) => [field, 'x'])))).toBe(
      true,
    )
    expect(inside.map((field) => hasAdvancedIssues(new Map([[field, 'x']])))).toStrictEqual([
      true,
      true,
      true,
      true,
    ])
  })
})

describe('blockingIssues', () => {
  it('should let a connection without a name be tested or listed, not saved', () => {
    expect(blockingIssues([NAME_ISSUE, USER_ISSUE], FormAction.Save)).toStrictEqual([
      NAME_ISSUE,
      USER_ISSUE,
    ])
    expect(blockingIssues([NAME_ISSUE, USER_ISSUE], FormAction.Test)).toStrictEqual([USER_ISSUE])
    expect(blockingIssues([NAME_ISSUE, USER_ISSUE], FormAction.ListDatabases)).toStrictEqual([
      USER_ISSUE,
    ])
  })
})

describe('firstIssue', () => {
  it('should find the problem met first going down the form', () => {
    const fields = [
      ConnectionField.SslKeyPath,
      ConnectionField.SslCertPath,
      ConnectionField.SslCaPath,
      ConnectionField.SslMode,
      ConnectionField.SshPrivateKeyPath,
      ConnectionField.SshUser,
      ConnectionField.SshPort,
      ConnectionField.SshHost,
      ConnectionField.Database,
      ConnectionField.User,
      ConnectionField.Port,
      ConnectionField.Host,
      ConnectionField.Folder,
      ConnectionField.Name,
      ConnectionField.Engine,
    ]

    const order = fields.map(
      (field) => firstIssue(fields.slice(0, fields.indexOf(field) + 1).map(issue))?.field,
    )

    expect(order).toStrictEqual(fields)
    expect(firstIssue([])).toBeUndefined()
  })
})

describe('showIssues', () => {
  it('should show every problem and take the user to the first one', () => {
    const sut = showIssues(opened(), [USER_ISSUE], USER_ISSUE)

    expect(sut).toMatchObject({
      isShowingAllIssues: true,
      isAdvancedOpen: false,
      focus: { field: ConnectionField.User },
    })
  })

  it('should open the advanced section when one of its fields has a problem', () => {
    const ssl = issue(ConnectionField.SslKeyPath)

    expect(showIssues(opened(), [USER_ISSUE, ssl], USER_ISSUE).isAdvancedOpen).toBe(true)
    expect(showIssues(opened({ isAdvancedOpen: true }), [USER_ISSUE], USER_ISSUE)).toMatchObject({
      isAdvancedOpen: true,
    })
  })
})
