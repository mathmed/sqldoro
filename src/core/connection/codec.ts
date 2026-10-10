import {
  type JsonRecord,
  readArray,
  readBoolean,
  readNested,
  readNumber,
  readOneOf,
  readRecord,
  readString,
} from '../json/record.ts'
import {
  type ConnectionConfig,
  isEnvironmentTag,
  isSshAuthMethod,
  isSslMode,
  type SshTunnelOptions,
  type SslOptions,
} from './connection.ts'

const STORAGE_VERSION = 1

export interface StoredConnections {
  readonly version: number
  readonly connections: readonly unknown[]
}

export interface DecodedConnections {
  readonly connections: readonly ConnectionConfig[]
  // Entries this version cannot read: they are written back as they are, never dropped.
  readonly unreadable: readonly unknown[]
  readonly problems: readonly string[]
  // False when the whole value is unreadable, for example written by a newer version.
  readonly isWritable: boolean
}

interface DecodedEntry {
  readonly entry: unknown
  readonly connection: ConnectionConfig | undefined
  readonly problem: string | undefined
}

export function encodeConnections(
  connections: readonly ConnectionConfig[],
  unreadable: readonly unknown[],
): StoredConnections {
  return { version: STORAGE_VERSION, connections: [...connections, ...unreadable] }
}

export function decodeConnections(value: unknown): DecodedConnections {
  if (value === undefined) {
    return { connections: [], unreadable: [], problems: [], isWritable: true }
  }
  try {
    const stored = readRecord(value)
    const version = readNumber(stored, 'version')
    if (version !== STORAGE_VERSION) {
      return unwritable(`their format (version ${String(version)}) is not supported`)
    }
    return decodeEntries(readArray(stored, 'connections'))
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error
    }
    return unwritable(error.message)
  }
}

function unwritable(reason: string): DecodedConnections {
  const problem = `The saved connections cannot be read: ${reason}`
  return { connections: [], unreadable: [], problems: [problem], isWritable: false }
}

function decodeEntries(entries: readonly unknown[]): DecodedConnections {
  const decoded = entries.map(decodeEntry)
  return {
    connections: decoded.flatMap(({ connection }) =>
      connection === undefined ? [] : [connection],
    ),
    unreadable: decoded.flatMap(({ entry, connection }) =>
      connection === undefined ? [entry] : [],
    ),
    problems: decoded.flatMap(({ problem }) => (problem === undefined ? [] : [problem])),
    isWritable: true,
  }
}

function decodeEntry(entry: unknown, index: number): DecodedEntry {
  try {
    return { entry, connection: decodeConnection(entry), problem: undefined }
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error
    }
    const problem = `Saved connection #${String(index + 1)} cannot be read: ${error.message}`
    return { entry, connection: undefined, problem }
  }
}

function decodeConnection(value: unknown): ConnectionConfig {
  const record = readRecord(value)
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
