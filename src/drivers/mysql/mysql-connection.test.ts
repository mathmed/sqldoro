import { createServer, type Server, type Socket } from 'node:net'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mysql } from '../../../test/fakes/mysql2.ts'
import type { ConnectRequest, TlsSettings } from '../../core/engine/engine.ts'
import { closeConnection, connectionOptions, openConnection } from './mysql-connection.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

const REQUEST: ConnectRequest = {
  endpoint: { host: '127.0.0.1', port: 40_001 },
  user: 'app',
  password: 's3cret',
  database: 'shop',
  tls: undefined,
  onUnexpectedClose: vi.fn(),
}
const TLS: TlsSettings = {
  serverName: 'db.example.com',
  shouldVerifyCertificate: true,
  shouldVerifyHostname: true,
  ca: 'CA PEM',
  cert: 'CERT PEM',
  key: 'KEY PEM',
}

describe('connectionOptions', () => {
  it('should keep exact values and dates as text and dial the endpoint', () => {
    const options = connectionOptions(REQUEST)
    const { stream, ...sut } = options as { stream: unknown }

    expect(sut).toStrictEqual({
      host: '127.0.0.1',
      port: 40_001,
      user: 'app',
      password: 's3cret',
      database: 'shop',
      connectTimeout: 15_000,
      supportBigNumbers: true,
      bigNumberStrings: true,
      dateStrings: true,
      jsonStrings: true,
      connectAttributes: { program_name: 'sqldoro' },
      maxPreparedStatements: 16,
    })
    expect(stream).toBeTypeOf('function')
  })

  it('should leave the database out to use the default one', () => {
    expect(connectionOptions({ ...REQUEST, database: '' })).not.toHaveProperty('database')
  })

  it('should verify the certificate against the database host name', () => {
    expect(connectionOptions({ ...REQUEST, tls: TLS })).toMatchObject({
      host: 'db.example.com',
      ssl: {
        rejectUnauthorized: true,
        verifyIdentity: true,
        ca: 'CA PEM',
        cert: 'CERT PEM',
        key: 'KEY PEM',
      },
    })
  })

  it('should only send the certificate files that are set', () => {
    const tls = {
      ...TLS,
      shouldVerifyCertificate: false,
      shouldVerifyHostname: false,
      ca: undefined,
      cert: undefined,
      key: undefined,
    }

    expect(connectionOptions({ ...REQUEST, tls }).ssl).toStrictEqual({
      rejectUnauthorized: false,
      verifyIdentity: false,
    })
  })

  describe('stream', () => {
    let server: Server
    let port: number
    const accepted: Socket[] = []

    beforeEach(async () => {
      server = createServer((socket) => accepted.push(socket))
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      port = typeof address === 'object' && address !== null ? address.port : 0
    })

    afterEach(async () => {
      for (const socket of accepted.splice(0)) {
        socket.destroy()
      }
      await new Promise((resolve) => server.close(resolve))
    })

    it('should dial the endpoint, even when TLS names another host', async () => {
      const options = connectionOptions({
        ...REQUEST,
        endpoint: { host: '127.0.0.1', port },
        tls: TLS,
      })
      const dial = options.stream as () => Socket

      const socket = dial()
      await vi.waitFor(() => {
        expect(accepted).toHaveLength(1)
      })
      socket.destroy()

      expect(options.host).toBe('db.example.com')
    })
  })
})

describe('openConnection', () => {
  beforeEach(() => {
    mysql.reset()
  })

  it('should resolve with the connection once mysql2 is connected', async () => {
    const onError = vi.fn()

    const sut = await openConnection(REQUEST, onError)

    expect(sut).toBe(mysql.connections[0])
    sut.emit('error', new Error('later'))
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error('later'))
  })

  it('should destroy the connection and reject when the server refuses it', async () => {
    mysql.script.connectError = new Error("Access denied for user 'app'")

    await expect(openConnection(REQUEST, vi.fn())).rejects.toThrow("Access denied for user 'app'")
    expect(mysql.connections[0]?.isDestroyed).toBe(true)
  })

  it.each([
    { case: 'without TLS', tls: undefined },
    {
      case: 'without host name check',
      tls: { ...TLS, serverName: '192.0.2.3', shouldVerifyHostname: false },
    },
    { case: 'for a host name', tls: TLS },
    { case: 'straight to an IP address', tls: { ...TLS, serverName: '127.0.0.1' } },
  ])('should connect $case', async ({ tls }) => {
    await expect(openConnection({ ...REQUEST, tls }, vi.fn())).resolves.toBeDefined()
  })

  it('should refuse to check the host name of an IP address through a tunnel', async () => {
    const tls = { ...TLS, serverName: '192.0.2.3' }

    await expect(openConnection({ ...REQUEST, tls }, vi.fn())).rejects.toThrow(
      'MySQL cannot verify the host name of an IP address through an SSH tunnel: use verify-ca, or the host name of the server',
    )
    expect(mysql.connections).toHaveLength(0)
  })
})

describe('closeConnection', () => {
  beforeEach(() => {
    mysql.reset()
  })

  it('should end the connection politely', async () => {
    const connection = await openConnection(REQUEST, vi.fn())

    await closeConnection(connection)

    expect(mysql.connections[0]).toMatchObject({ isEnded: true, isDestroyed: false })
  })

  it('should let go of a connection that cannot end politely', async () => {
    const connection = await openConnection(REQUEST, vi.fn())
    mysql.script.endError = new Error("Can't add new command when connection is in closed state")

    await expect(closeConnection(connection)).resolves.toBeUndefined()
    expect(mysql.connections[0]?.isDestroyed).toBe(true)
  })
})
