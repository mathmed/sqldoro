import type { PeerCertificate } from 'node:tls'

import pgLibrary from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pg, pgRequest } from '../../../test/fakes/pg.ts'
import type { TlsSettings } from '../../core/engine/engine.ts'
import { clientConfig, closeClient, openClient, TYPES } from './postgres-connection.ts'

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { FakeClient } = await import('../../../test/fakes/pg.ts')
  return { default: { ...original.default, Client: FakeClient } }
})

const { builtins } = pgLibrary.types
const TLS: TlsSettings = {
  serverName: 'db.example.com',
  shouldVerifyCertificate: true,
  shouldVerifyHostname: true,
  ca: 'CA PEM',
  cert: 'CERT PEM',
  key: 'KEY PEM',
}

function certificateFor(host: string): PeerCertificate {
  return { subject: { CN: host }, subjectaltname: `DNS:${host}` } as unknown as PeerCertificate
}

const getParser = TYPES.getTypeParser as (oid: number) => (text: string) => unknown

function parse(oid: number, text: string): unknown {
  return getParser(oid)(text)
}

describe('TYPES', () => {
  it('should read booleans, small integers and floats as JavaScript values', () => {
    expect(parse(builtins.BOOL, 't')).toBe(true)
    expect(parse(builtins.BOOL, 'f')).toBe(false)
    expect(parse(builtins.INT2, '7')).toBe(7)
    expect(parse(builtins.INT4, '-42')).toBe(-42)
    expect(parse(builtins.OID, '1259')).toBe(1259)
    expect(parse(builtins.FLOAT4, '1.5')).toBe(1.5)
    expect(parse(builtins.FLOAT8, 'NaN')).toBeNaN()
  })

  it.each([
    [builtins.INT8, '9007199254740993'],
    [builtins.NUMERIC, '12345678901234567890.0123456789'],
    [builtins.TIMESTAMPTZ, '2024-02-29 23:59:59.123+00'],
    [builtins.DATE, '2024-02-29'],
    [builtins.JSONB, '{"a": 1}'],
  ])('should keep the text of type %i as the server sent it', (oid, text) => {
    expect(parse(oid, text)).toBe(text)
  })

  it('should write binary values as hexadecimal text with a 0x prefix, like MySQL', () => {
    expect(parse(builtins.BYTEA, '\\x00ff')).toBe('0x00ff')
    expect(parse(builtins.BYTEA, '\\x')).toBe('0x')
  })

  it('should keep binary values in the escape format as the server sent them', () => {
    expect(parse(builtins.BYTEA, 'ab\\000')).toBe('ab\\000')
  })
})

describe('clientConfig', () => {
  it('should dial the endpoint without TLS', () => {
    expect(clientConfig(pgRequest(), 'shop')).toStrictEqual({
      host: '127.0.0.1',
      port: 5432,
      user: 'app',
      password: 's3cret',
      database: 'shop',
      ssl: false,
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
      application_name: 'sqldoro',
      types: TYPES,
    })
  })

  it('should leave the database out to use the default one', () => {
    expect(clientConfig(pgRequest(), '')).not.toHaveProperty('database')
  })

  it('should verify the certificate against the database host name', () => {
    const ssl = clientConfig(pgRequest({ tls: TLS }), 'shop').ssl

    expect(ssl).toMatchObject({
      rejectUnauthorized: true,
      servername: 'db.example.com',
      ca: 'CA PEM',
      cert: 'CERT PEM',
      key: 'KEY PEM',
    })
  })

  it('should check the host name against the server name, whatever host the socket dialed', () => {
    const ssl = clientConfig(pgRequest({ tls: TLS }), 'shop').ssl as {
      checkServerIdentity: (host: string, cert: PeerCertificate) => Error | undefined
    }

    expect(ssl.checkServerIdentity('127.0.0.1', certificateFor('db.example.com'))).toBeUndefined()
    expect(
      ssl.checkServerIdentity('db.example.com', certificateFor('evil.example.com')),
    ).toBeInstanceOf(Error)
  })

  it('should not check the host name when told so', () => {
    const tls = { ...TLS, shouldVerifyHostname: false }
    const ssl = clientConfig(pgRequest({ tls }), 'shop').ssl as {
      checkServerIdentity: (host: string, cert: PeerCertificate) => Error | undefined
    }

    expect(
      ssl.checkServerIdentity('db.example.com', certificateFor('evil.example.com')),
    ).toBeUndefined()
  })

  it('should not name an IP address in TLS and only send the files that are set', () => {
    const tls = {
      ...TLS,
      serverName: '192.0.2.10',
      shouldVerifyCertificate: false,
      ca: undefined,
      cert: undefined,
      key: undefined,
    }
    const ssl = clientConfig(pgRequest({ tls }), 'shop').ssl

    expect(
      Object.keys(ssl as object).toSorted((left, right) => left.localeCompare(right)),
    ).toStrictEqual(['checkServerIdentity', 'rejectUnauthorized'])
    expect(ssl).toMatchObject({ rejectUnauthorized: false })
  })
})

describe('openClient', () => {
  beforeEach(() => {
    pg.reset()
  })

  it('should connect and keep listening for errors', async () => {
    const onError = vi.fn()

    const sut = await openClient(clientConfig(pgRequest(), 'shop'), onError)
    sut.emit('error', new Error('terminated'))

    expect(sut).toBe(pg.clients[0])
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error('terminated'))
  })

  it('should stop listening and reject when the server refuses the connection', async () => {
    pg.script.connectError = new Error('password authentication failed for user "app"')

    await expect(openClient(clientConfig(pgRequest(), 'shop'), vi.fn())).rejects.toThrow(
      'password authentication failed for user "app"',
    )
    expect(pg.clients[0]?.listenerCount('error')).toBe(0)
  })
})

describe('closeClient', () => {
  beforeEach(() => {
    pg.reset()
  })

  it('should end the client', async () => {
    const client = await openClient(clientConfig(pgRequest(), 'shop'), vi.fn())

    await closeClient(client)

    expect(pg.clients[0]?.isEnded).toBe(true)
  })
})
