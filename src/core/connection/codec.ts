import {
  type JsonRecord,
  readBoolean,
  readNested,
  readNumber,
  readOneOf,
  readRecord,
  readString,
} from '../json/record.ts'
import { decodeList, encodeList, type ListFormat } from '../json/versioned-list.ts'
import {
  ConnectionColor,
  type ConnectionConfig,
  isConnectionColor,
  isEnvironmentTag,
  isSshAuthMethod,
  isSslMode,
  type SshTunnelOptions,
  type SslOptions,
} from './connection.ts'

// Version 2 gave connections a color and a folder: connections saved before have neither.
const FORMAT: ListFormat<ConnectionConfig> = {
  version: 2,
  key: 'connections',
  listName: 'saved connections',
  entryName: 'Saved connection',
  decode: decodeConnection,
  migrations: new Map([[1, withoutColorOrFolder]]),
}

function withoutColorOrFolder(entry: unknown): unknown {
  return typeof entry === 'object' && entry !== null
    ? { color: ConnectionColor.None, folder: '', ...entry }
    : entry
}

export interface DecodedConnections {
  readonly connections: readonly ConnectionConfig[]
  // Entries this version cannot read: they are written back as they are, never dropped.
  readonly unreadable: readonly unknown[]
  readonly problems: readonly string[]
  // False when the whole value is unreadable, for example written by a newer version.
  readonly isWritable: boolean
}

export function encodeConnections(
  connections: readonly ConnectionConfig[],
  unreadable: readonly unknown[],
): Readonly<Record<string, unknown>> {
  return encodeList(connections, unreadable, FORMAT)
}

export function decodeConnections(value: unknown): DecodedConnections {
  const { items, ...rest } = decodeList(value, FORMAT)
  return { connections: items, ...rest }
}

function decodeConnection(value: unknown): ConnectionConfig {
  return readConnection(readRecord(value))
}

// A connection as it is stored and as the connection form sends it: a tunnel that is not there is
// left out, never null.
export function readConnection(record: JsonRecord): ConnectionConfig {
  return {
    id: readString(record, 'id'),
    name: readString(record, 'name'),
    engine: readString(record, 'engine'),
    host: readString(record, 'host'),
    port: readNumber(record, 'port'),
    user: readString(record, 'user'),
    database: readString(record, 'database'),
    ssl: decodeSsl(readNested(record, 'ssl')),
    ssh: record.get('ssh') === undefined ? undefined : decodeSsh(readNested(record, 'ssh')),
    environment: readOneOf(record, 'environment', isEnvironmentTag),
    isReadOnly: readBoolean(record, 'isReadOnly'),
    color: readOneOf(record, 'color', isConnectionColor),
    folder: readString(record, 'folder'),
  }
}

function decodeSsl(record: JsonRecord): SslOptions {
  return {
    mode: readOneOf(record, 'mode', isSslMode),
    caPath: readString(record, 'caPath'),
    certPath: readString(record, 'certPath'),
    keyPath: readString(record, 'keyPath'),
    shouldRejectUnauthorized: readBoolean(record, 'shouldRejectUnauthorized'),
  }
}

function decodeSsh(record: JsonRecord): SshTunnelOptions {
  return {
    host: readString(record, 'host'),
    port: readNumber(record, 'port'),
    user: readString(record, 'user'),
    authMethod: readOneOf(record, 'authMethod', isSshAuthMethod),
    privateKeyPath: readString(record, 'privateKeyPath'),
  }
}
