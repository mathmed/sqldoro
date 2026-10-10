import { describe, expect, it } from 'vitest'

import { formSetup, VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import { DEFAULT_SSH_TUNNEL } from '../connection/connection.ts'
import { SecretKind } from '../connection/secrets.ts'
import { ConnectionField } from '../connection/validation.ts'
import { parseFormHostMessage } from './parse-host-message.ts'
import { FormMode } from './protocol.ts'

// What the message would be after its trip through JSON: a missing tunnel is left out.
function overTheWire(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

describe('parseFormHostMessage', () => {
  it('should read the setup the form opens with', () => {
    const setup = formSetup({
      mode: FormMode.Edit,
      connection: { ...VALID_CONNECTION, ssh: DEFAULT_SSH_TUNNEL },
      heldSecrets: [SecretKind.Password, SecretKind.SshPassword],
      notices: ['Ignored the URL parameter "x"'],
    })

    expect(parseFormHostMessage(overTheWire({ type: 'open', setup }))).toStrictEqual({
      type: 'open',
      setup,
    })
    expect(parseFormHostMessage(overTheWire({ type: 'open', setup: formSetup() }))).toStrictEqual({
      type: 'open',
      setup: formSetup(),
    })
  })

  it('should name what is wrong in a setup', () => {
    const open = (changes: object): unknown => ({
      type: 'open',
      setup: { ...formSetup(), ...changes },
    })

    expect(() => parseFormHostMessage(open({ mode: 'view' }))).toThrow(
      new TypeError('"mode" must be a known value'),
    )
    expect(() => parseFormHostMessage(open({ heldSecrets: ['token'] }))).toThrow(
      new TypeError('"0" must be a known value'),
    )
    expect(() => parseFormHostMessage(open({ engines: [{ id: 'x', displayName: 'X' }] }))).toThrow(
      new TypeError('"defaultPort" must be a whole number of 0 or more'),
    )
    expect(() => parseFormHostMessage(open({ takenNameKeys: [1] }))).toThrow(
      new TypeError('"0" must be a string'),
    )
    expect(() => parseFormHostMessage(open({ productionEnvironments: null }))).toThrow(
      new TypeError('"productionEnvironments" must be a list'),
    )
    expect(() => parseFormHostMessage(open({ notices: 'x' }))).toThrow(
      new TypeError('"notices" must be a list'),
    )
    expect(() =>
      parseFormHostMessage(open({ connection: { ...VALID_CONNECTION, port: null } })),
    ).toThrow(new TypeError('"port" must be a number'))
    expect(() => parseFormHostMessage({ type: 'open' })).toThrow(
      new TypeError('"setup" must be an object'),
    )
  })

  it('should read the file chosen for a path field', () => {
    expect(
      parseFormHostMessage({ type: 'file', field: ConnectionField.SslCaPath, path: '/ca.pem' }),
    ).toStrictEqual({ type: 'file', field: ConnectionField.SslCaPath, path: '/ca.pem' })
    expect(() => parseFormHostMessage({ type: 'file', field: 'host', path: '/x' })).toThrow(
      new TypeError('"field" must be a known value'),
    )
    expect(() => parseFormHostMessage({ type: 'file', field: 'sslCaPath' })).toThrow(
      new TypeError('"path" must be a string'),
    )
  })

  it('should read how a test went', () => {
    expect(
      parseFormHostMessage({ type: 'tested', isSuccess: false, message: 'down' }),
    ).toStrictEqual({
      type: 'tested',
      isSuccess: false,
      message: 'down',
    })
    expect(() => parseFormHostMessage({ type: 'tested', isSuccess: 1, message: 'x' })).toThrow(
      new TypeError('"isSuccess" must be a boolean'),
    )
    expect(() => parseFormHostMessage({ type: 'tested', isSuccess: true })).toThrow(
      new TypeError('"message" must be a string'),
    )
  })

  it('should read why a save was refused', () => {
    const issues = [{ field: ConnectionField.Name, message: 'Taken' }]

    expect(parseFormHostMessage({ type: 'saveRefused', message: 'No', issues })).toStrictEqual({
      type: 'saveRefused',
      message: 'No',
      issues,
    })
    expect(() =>
      parseFormHostMessage({ type: 'saveRefused', message: 'No', issues: [{ field: 'x' }] }),
    ).toThrow(new TypeError('"field" must be a known value'))
    expect(() =>
      parseFormHostMessage({ type: 'saveRefused', message: 'No', issues: [{ field: 'name' }] }),
    ).toThrow(new TypeError('"message" must be a string'))
    expect(() => parseFormHostMessage({ type: 'saveRefused', issues })).toThrow(
      new TypeError('"message" must be a string'),
    )
  })

  it('should refuse a message of an unknown type', () => {
    expect(() => parseFormHostMessage({ type: 'rows' })).toThrow(
      new TypeError('"type" must be a known value'),
    )
    expect(() => parseFormHostMessage('open')).toThrow(new TypeError('expected an object'))
  })
})
