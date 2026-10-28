import { isIP } from 'node:net'
import { checkServerIdentity, type ConnectionOptions } from 'node:tls'

import pg, { type Client, type ClientConfig, type CustomTypesConfig } from 'pg'

import type { ConnectRequest, TlsSettings } from '../../core/engine/engine.ts'

const CONNECT_TIMEOUT_MS = 15_000
const APPLICATION_NAME = 'sqldoro'
const { builtins } = pg.types

type Parser = (text: string) => boolean | number | string

const BYTEA_HEX_PREFIX = '\\x'

const parseBoolean: Parser = (text) => text === 't'
const parseNumber: Parser = (text) => Number(text)
// Binary values read as hexadecimal text with a 0x prefix, like MySQL's.
const parseBytea: Parser = (text) =>
  text.startsWith(BYTEA_HEX_PREFIX) ? `0x${text.slice(BYTEA_HEX_PREFIX.length)}` : text

// Only these types become JavaScript values (and bytea normalized hexadecimal text); every other
// value stays the text PostgreSQL sent: exact numbers, dates in the server's format, JSON as written.
const PARSERS: ReadonlyMap<number, Parser> = new Map([
  [builtins.BOOL, parseBoolean],
  [builtins.INT2, parseNumber],
  [builtins.INT4, parseNumber],
  [builtins.OID, parseNumber],
  [builtins.FLOAT4, parseNumber],
  [builtins.FLOAT8, parseNumber],
  [builtins.BYTEA, parseBytea],
])

const keepText: Parser = (text) => text

export const TYPES: CustomTypesConfig = {
  getTypeParser: (oid: number) => PARSERS.get(oid) ?? keepText,
}

export function clientConfig(request: ConnectRequest, database: string): ClientConfig {
  return {
    host: request.endpoint.host,
    port: request.endpoint.port,
    user: request.user,
    password: request.password,
    ...(database === '' ? {} : { database }),
    ssl: request.tls === undefined ? false : tlsOptions(request.tls),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    keepAlive: true,
    application_name: APPLICATION_NAME,
    types: TYPES,
  }
}

// A client on its way: the client exists at once, for a caller that may give up before it is
// connected; `connected` settles once it is.
export interface PgOpening {
  readonly client: Client
  readonly connected: Promise<void>
}

// pg emits the failures of an idle connection on the client: `onError` must listen from the start,
// or Node.js would throw them.
export function startClient(config: ClientConfig, onError: (error: Error) => void): PgOpening {
  const client = new pg.Client(config)
  client.on('error', onError)
  const connected = client.connect().then(
    () => undefined,
    (error: unknown) => {
      client.removeListener('error', onError)
      throw error
    },
  )
  return { client, connected }
}

export async function openClient(
  config: ClientConfig,
  onError: (error: Error) => void,
): Promise<Client> {
  const { client, connected } = startClient(config, onError)
  await connected
  return client
}

export async function closeClient(client: Client): Promise<void> {
  await client.end()
}

// Ends a client at once, whatever the server and the network do: its socket goes, and every query
// of the client fails.
export function dropClient(client: Client): void {
  client.connection.stream.destroy()
}

// The certificate is checked against the database host name even when the connection goes through
// the local end of a tunnel.
function tlsOptions(tls: TlsSettings): ConnectionOptions {
  return {
    rejectUnauthorized: tls.shouldVerifyCertificate,
    checkServerIdentity: (...[, certificate]: Parameters<typeof checkServerIdentity>) =>
      tls.shouldVerifyHostname ? checkServerIdentity(tls.serverName, certificate) : undefined,
    ...(isIP(tls.serverName) === 0 ? { servername: tls.serverName } : {}),
    ...(tls.ca === undefined ? {} : { ca: tls.ca }),
    ...(tls.cert === undefined ? {} : { cert: tls.cert }),
    ...(tls.key === undefined ? {} : { key: tls.key }),
  }
}
