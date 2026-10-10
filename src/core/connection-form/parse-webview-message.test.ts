import { describe, expect, it } from 'vitest'

import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import { SecretKind } from '../connection/secrets.ts'
import { ConnectionField } from '../connection/validation.ts'
import { parseFormViewMessage } from './parse-webview-message.ts'

const DRAFT = {
  connection: VALID_CONNECTION,
  secretChanges: [
    { kind: SecretKind.Password, value: 's3cret' },
    { kind: SecretKind.SshPassword, value: '' },
  ],
}

describe('parseFormViewMessage', () => {
  it('should read the messages without fields', () => {
    expect(parseFormViewMessage({ type: 'ready' })).toStrictEqual({ type: 'ready' })
    expect(parseFormViewMessage({ type: 'cancel', extra: 1 })).toStrictEqual({ type: 'cancel' })
  })

  it('should read a request for the file of a path field', () => {
    expect(
      parseFormViewMessage({ type: 'browse', field: ConnectionField.SshPrivateKeyPath }),
    ).toStrictEqual({ type: 'browse', field: ConnectionField.SshPrivateKeyPath })
    expect(() => parseFormViewMessage({ type: 'browse', field: 'name' })).toThrow(
      new TypeError('"field" must be a known value'),
    )
  })

  it('should read the draft to test or save, with the secrets typed for it', () => {
    expect(parseFormViewMessage({ type: 'test', draft: DRAFT })).toStrictEqual({
      type: 'test',
      draft: DRAFT,
    })
    expect(
      parseFormViewMessage(JSON.parse(JSON.stringify({ type: 'save', draft: DRAFT }))),
    ).toStrictEqual({ type: 'save', draft: DRAFT })
  })

  it('should name what is wrong in a draft without telling a secret', () => {
    const save = (draft: object): unknown => ({ type: 'save', draft: { ...DRAFT, ...draft } })

    expect(() => parseFormViewMessage({ type: 'save' })).toThrow(
      new TypeError('"draft" must be an object'),
    )
    expect(() =>
      parseFormViewMessage(save({ secretChanges: [{ kind: 'token', value: 'x' }] })),
    ).toThrow(new TypeError('"kind" must be a known value'))
    expect(() =>
      parseFormViewMessage(save({ secretChanges: [{ kind: SecretKind.Password, value: 7 }] })),
    ).toThrow(new TypeError('"value" must be a string'))
    expect(() =>
      parseFormViewMessage(save({ connection: { ...VALID_CONNECTION, host: 1 } })),
    ).toThrow(new TypeError('"host" must be a string'))
    expect(() => parseFormViewMessage(save({ connection: null }))).toThrow(
      new TypeError('"connection" must be an object'),
    )
  })

  it('should read the draft whose server to list the databases of', () => {
    expect(parseFormViewMessage({ type: 'listDatabases', draft: DRAFT })).toStrictEqual({
      type: 'listDatabases',
      draft: DRAFT,
    })
    expect(() => parseFormViewMessage({ type: 'listDatabases', draft: [] })).toThrow(
      new TypeError('"draft" must be an object'),
    )
  })

  it('should read a connection string without telling it', () => {
    expect(parseFormViewMessage({ type: 'import', text: 'mysql://root:pw@db' })).toStrictEqual({
      type: 'import',
      text: 'mysql://root:pw@db',
    })
    expect(() => parseFormViewMessage({ type: 'import', text: ['mysql://root:pw@db'] })).toThrow(
      new TypeError('"text" must be a string'),
    )
  })

  it('should refuse to change a secret twice in one draft', () => {
    const twice = [
      { kind: SecretKind.Password, value: 'first' },
      { kind: SecretKind.Password, value: 'second' },
    ]

    expect(() =>
      parseFormViewMessage({ type: 'test', draft: { ...DRAFT, secretChanges: twice } }),
    ).toThrow(new TypeError('"secretChanges" must change each secret once'))
  })

  it('should read a problem of the webview for the log', () => {
    expect(parseFormViewMessage({ type: 'problem', message: 'unreadable' })).toStrictEqual({
      type: 'problem',
      message: 'unreadable',
    })
  })

  it('should refuse a message of an unknown type', () => {
    expect(() => parseFormViewMessage({ type: 'fetchRows' })).toThrow(
      new TypeError('"type" must be a known value'),
    )
    expect(() => parseFormViewMessage(null)).toThrow(new TypeError('expected an object'))
  })
})
