import { connect, isIP, type Socket } from 'node:net'

import mysql, { type Connection, type ConnectionOptions, type SslOptions } from 'mysql2'

import type { ConnectRequest, Endpoint, TlsSettings } from '../../core/engine/engine.ts'

const CONNECT_TIMEOUT_MS = 15_000
const KEEP_ALIVE_DELAY_MS = 15_000
const PROGRAM_NAME = 'sqldoro'
// Statements with bound values are prepared on the server; the oldest are closed past this many.
const MAX_PREPARED_STATEMENTS = 16

export function connectionOptions(request: ConnectRequest): ConnectionOptions {
  return {
    // mysql2 checks the certificate against `host`: the database host name, even through a tunnel,
    // while the stream below dials the endpoint.
    host: request.tls?.serverName ?? request.endpoint.host,
    port: request.endpoint.port,
    user: request.user,
    password: request.password,
    ...(request.database === '' ? {} : { database: request.database }),
    ...(request.tls === undefined ? {} : { ssl: sslOptions(request.tls) }),
    stream: () => dial(request.endpoint),
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Exact values: DECIMAL and BIGINT as text, dates and JSON as the server sends them.
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    jsonStrings: true,
    connectAttributes: { program_name: PROGRAM_NAME },
    maxPreparedStatements: MAX_PREPARED_STATEMENTS,
  }
}

// mysql2 emits the failures that reach no statement on the connection itself: `onError` must
// listen from the start, or Node.js would throw them.
export async function openConnection(
  request: ConnectRequest,
  onError: (error: Error) => void,
): Promise<Connection> {
  checkTunnelledIdentity(request)
  const connection = mysql.createConnection(connectionOptions(request))
  connection.on('error', onError)
  const { promise, resolve, reject } = Promise.withResolvers<Connection>()
  connection.connect((error: unknown) => {
    if (error instanceof Error) {
      connection.destroy()
      reject(error)
      return
    }
    resolve(connection)
  })
  return promise
}

export async function closeConnection(connection: Connection): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>()
  // A connection the server already dropped cannot say goodbye: it is simply let go.
  connection.end((error: unknown) => {
    if (error instanceof Error) {
      connection.destroy()
    }
    resolve(undefined)
  })
  return promise
}

function sslOptions(tls: TlsSettings): SslOptions {
  return {
    rejectUnauthorized: tls.shouldVerifyCertificate,
    verifyIdentity: tls.shouldVerifyHostname,
    ...(tls.ca === undefined ? {} : { ca: tls.ca }),
    ...(tls.cert === undefined ? {} : { cert: tls.cert }),
    ...(tls.key === undefined ? {} : { key: tls.key }),
  }
}

function dial(endpoint: Endpoint): Socket {
  const socket = connect(endpoint.port, endpoint.host)
  socket.setNoDelay(true)
  socket.setKeepAlive(true, KEEP_ALIVE_DELAY_MS)
  return socket
}

// mysql2 can only check the host name of an IP address on the socket it dialed, which is the local
// end of the tunnel: refuse rather than verify the wrong name.
function checkTunnelledIdentity({ endpoint, tls }: ConnectRequest): void {
  if (tls === undefined || !tls.shouldVerifyHostname || isIP(tls.serverName) === 0) {
    return
  }
  if (endpoint.host !== tls.serverName) {
    throw new Error(
      'MySQL cannot verify the host name of an IP address through an SSH tunnel: use verify-ca, or the host name of the server',
    )
  }
}
