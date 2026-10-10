import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { decodeConnections, encodeConnections } from './codec.ts'
import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  EnvironmentTag,
  newConnection,
  SshAuthMethod,
  SslMode,
} from './connection.ts'

const PLAIN: ConnectionConfig = { ...newConnection('a', fakeEngine()), name: 'Local', user: 'me' }
const TUNNELED: ConnectionConfig = {
  ...PLAIN,
  id: 'b',
  name: 'Prod',
  ssl: {
    mode: SslMode.VerifyFull,
    caPath: '/ca',
    certPath: '/c',
    keyPath: '/k',
    shouldRejectUnauthorized: true,
  },
  ssh: {
    ...DEFAULT_SSH_TUNNEL,
    host: 'bastion',
    user: 'ops',
    authMethod: SshAuthMethod.PrivateKey,
    privateKeyPath: '/id',
  },
  environment: EnvironmentTag.Production,
  isReadOnly: false,
}

// What VS Code keeps: the JSON form of the value, where undefined properties disappear.
function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

describe('encodeConnections', () => {
  it('should store a versioned list with the unreadable entries at the end', () => {
    expect(encodeConnections([PLAIN], [{ broken: true }])).toStrictEqual({
      version: 1,
      connections: [PLAIN, { broken: true }],
    })
  })
})

describe('decodeConnections', () => {
  it('should read nothing when nothing was saved yet', () => {
    expect(decodeConnections(undefined)).toStrictEqual({
      connections: [],
      unreadable: [],
      problems: [],
      isWritable: true,
    })
  })

  it('should read back what was stored', () => {
    const stored = roundTrip(encodeConnections([PLAIN, TUNNELED], []))

    expect(decodeConnections(stored)).toStrictEqual({
      connections: [PLAIN, TUNNELED],
      unreadable: [],
      problems: [],
      isWritable: true,
    })
  })

  it('should keep the entries it cannot read and explain why', () => {
    const broken = roundTrip({ ...PLAIN, port: '3306' })
    const stored = roundTrip({ version: 1, connections: [broken, PLAIN, 'junk'] })

    expect(decodeConnections(stored)).toStrictEqual({
      connections: [PLAIN],
      unreadable: [broken, 'junk'],
      problems: [
        'Saved connection #1 cannot be read: "port" must be a number',
        'Saved connection #3 cannot be read: expected an object',
      ],
      isWritable: true,
    })
  })

  it.each([
    { field: 'ssl', entry: { ...PLAIN, ssl: null }, problem: '"ssl" must be an object' },
    {
      field: 'ssl mode',
      entry: { ...PLAIN, ssl: { ...PLAIN.ssl, mode: 'prefer' } },
      problem: '"mode" must be a known value',
    },
    {
      field: 'ssh',
      entry: { ...TUNNELED, ssh: { ...DEFAULT_SSH_TUNNEL, authMethod: 'agent' } },
      problem: '"authMethod" must be a known value',
    },
    {
      field: 'environment',
      entry: { ...PLAIN, environment: 'qa' },
      problem: '"environment" must be a known value',
    },
    {
      field: 'read-only flag',
      entry: { ...PLAIN, isReadOnly: 'yes' },
      problem: '"isReadOnly" must be a boolean',
    },
  ])('should reject an entry with a wrong $field', ({ entry, problem }) => {
    expect(decodeConnections({ version: 1, connections: [entry] }).problems).toStrictEqual([
      `Saved connection #1 cannot be read: ${problem}`,
    ])
  })

  it.each([
    { stored: 'junk', reason: 'expected an object' },
    { stored: { connections: [] }, reason: '"version" must be a number' },
    { stored: { version: 1 }, reason: '"connections" must be a list' },
    {
      stored: { version: 2, connections: [] },
      reason: 'their format (version 2) is not supported',
    },
  ])(
    'should refuse to overwrite saved connections it cannot read: $reason',
    ({ stored, reason }) => {
      expect(decodeConnections(stored)).toStrictEqual({
        connections: [],
        unreadable: [],
        problems: [`The saved connections cannot be read: ${reason}`],
        isWritable: false,
      })
    },
  )

  it('should let unexpected errors through', () => {
    const exploding = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('storage failure')
        },
      },
    )

    expect(() => decodeConnections(exploding)).toThrow('storage failure')
    expect(() => decodeConnections({ version: 1, connections: [exploding] })).toThrow(
      'storage failure',
    )
  })
})
