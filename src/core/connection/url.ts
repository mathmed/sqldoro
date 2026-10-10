import type { EngineRegistry } from '../engine/engine-registry.ts'
import type { Engine } from '../engine/engine.ts'
import {
  type ConnectionConfig,
  DEFAULT_SSL,
  newConnection,
  SslMode,
  type SslOptions,
} from './connection.ts'
import { parsePort } from './fields.ts'
import { uniqueName } from './names.ts'

export interface ImportedConnection {
  readonly connection: ConnectionConfig
  // Goes to the secret storage, never to the connection metadata.
  readonly password: string
  readonly warnings: readonly string[]
}

export type UrlImport =
  | { readonly isValid: false; readonly message: string }
  | { readonly isValid: true; readonly imported: ImportedConnection }

export interface UrlImportContext {
  readonly engines: EngineRegistry
  readonly id: string
  readonly takenNameKeys: ReadonlySet<string>
}

interface Authority {
  readonly user: string
  readonly password: string
  readonly host: string
  readonly port: number
}

interface Parameters {
  readonly ssl: SslOptions
  readonly warnings: readonly string[]
}

interface Parameter {
  readonly key: string
  readonly value: string
}

class InvalidUrlError extends Error {}

const SCHEME_SEPARATOR = '://'
const SCHEME = /^[a-z][a-z\d+.-]*$/i
const PATH_KEYS: ReadonlyMap<string, keyof Pick<SslOptions, 'caPath' | 'certPath' | 'keyPath'>> =
  new Map([
    ['sslrootcert', 'caPath'],
    ['ssl-ca', 'caPath'],
    ['sslcert', 'certPath'],
    ['ssl-cert', 'certPath'],
    ['sslkey', 'keyPath'],
    ['ssl-key', 'keyPath'],
  ])
const SSL_MODE_KEYS: ReadonlySet<string> = new Set(['sslmode', 'ssl-mode'])
const SSL_SWITCH_KEY = 'ssl'
const SSL_MODES: ReadonlyMap<string, SslMode> = new Map([
  ['disable', SslMode.Disable],
  ['disabled', SslMode.Disable],
  ['require', SslMode.Require],
  ['required', SslMode.Require],
  ['verify-ca', SslMode.VerifyCa],
  ['verify-full', SslMode.VerifyFull],
  ['verify-identity', SslMode.VerifyFull],
])
// libpq and MySQL fall back to plain text with these modes; sqldoro requires SSL instead.
const FALLBACK_MODES: ReadonlySet<string> = new Set(['allow', 'prefer', 'preferred'])
const SSL_SWITCH: ReadonlyMap<string, SslMode> = new Map([
  ['true', SslMode.Require],
  ['1', SslMode.Require],
  ['false', SslMode.Disable],
  ['0', SslMode.Disable],
])

export function parseConnectionUrl(text: string, context: UrlImportContext): UrlImport {
  try {
    return { isValid: true, imported: importUrl(text.trim(), context) }
  } catch (error) {
    if (!(error instanceof InvalidUrlError)) {
      throw error
    }
    return { isValid: false, message: error.message }
  }
}

function importUrl(url: string, context: UrlImportContext): ImportedConnection {
  const [scheme, rest] = splitScheme(url, context.engines)
  const engine = engineFor(scheme, context.engines)
  const [withoutQuery, query] = splitOnce(beforeFirst(rest, '#'), '?')
  const [authority, path] = splitOnce(withoutQuery, '/')
  const { user, password, host, port } = parseAuthority(authority, engine)
  const database = parseDatabase(path)
  const { ssl, warnings } = parseParameters(query)
  const name = uniqueName(database === '' ? host : `${host}/${database}`, context.takenNameKeys)
  const connection = { ...newConnection(context.id, engine), name, host, port, user, database, ssl }
  return { connection, password, warnings }
}

function splitScheme(url: string, engines: EngineRegistry): readonly [string, string] {
  const separator = url.indexOf(SCHEME_SEPARATOR)
  const scheme = url.slice(0, Math.max(separator, 0))
  if (!SCHEME.test(scheme)) {
    throw new InvalidUrlError(`Enter a connection URL that starts with ${schemeList(engines)}`)
  }
  return [scheme, url.slice(separator + SCHEME_SEPARATOR.length)]
}

function engineFor(scheme: string, engines: EngineRegistry): Engine {
  const engine = engines.findByScheme(scheme)
  if (engine === undefined) {
    throw new InvalidUrlError(`Unsupported URL scheme "${scheme}": use ${schemeList(engines)}`)
  }
  return engine
}

function schemeList(engines: EngineRegistry): string {
  const schemes = engines.urlSchemes.map((scheme) => `${scheme}${SCHEME_SEPARATOR}`)
  const last = schemes.pop() ?? ''
  return schemes.length === 0 ? last : `${schemes.join(', ')} or ${last}`
}

function parseAuthority(authority: string, engine: Engine): Authority {
  const at = authority.lastIndexOf('@')
  const [user, password] = splitOnce(authority.slice(0, Math.max(at, 0)), ':')
  const hostPort = authority.slice(at + 1)
  if (hostPort.includes(',')) {
    return fail('URLs with several hosts are not supported')
  }
  const [host, port] = splitHostPort(hostPort)
  return {
    user: decode(user),
    password: decode(password),
    host: checkHost(decode(host)),
    port: port === '' ? engine.defaultPort : checkPort(port),
  }
}

function splitHostPort(hostPort: string): readonly [string, string] {
  return hostPort.startsWith('[') ? splitBracketedHost(hostPort) : splitPlainHost(hostPort)
}

function splitPlainHost(hostPort: string): readonly [string, string] {
  const [host, port] = splitOnce(hostPort, ':')
  return port.includes(':') ? fail('Write IPv6 addresses in brackets, such as [::1]') : [host, port]
}

function splitBracketedHost(hostPort: string): readonly [string, string] {
  const [host, rest] = splitOnce(hostPort.slice(1), ']')
  if (!hostPort.includes(']') || (rest !== '' && !rest.startsWith(':'))) {
    return fail('The IPv6 address of the URL is malformed')
  }
  return [host, rest.slice(1)]
}

function checkHost(host: string): string {
  if (host === '') {
    return fail('The URL has no host')
  }
  return host.startsWith('/') ? fail('Unix socket connections are not supported') : host
}

function checkPort(text: string): number {
  return parsePort(text) ?? fail(`Invalid port "${text}" in the URL`)
}

function parseDatabase(path: string): string {
  const database = decode(path)
  return database.includes('/') ? fail('The URL path can only hold the database name') : database
}

function parseParameters(query: string): Parameters {
  const warnings: string[] = []
  const ssl = query
    .split('&')
    .filter((pair) => pair !== '')
    .map(parseParameter)
    .reduce((options, parameter) => applyParameter(options, parameter, warnings), DEFAULT_SSL)
  return { ssl, warnings }
}

function parseParameter(pair: string): Parameter {
  const [key, value] = splitOnce(pair, '=')
  return { key: decode(key), value: decode(value) }
}

function applyParameter(ssl: SslOptions, parameter: Parameter, warnings: string[]): SslOptions {
  const pathKey = PATH_KEYS.get(parameter.key)
  if (pathKey !== undefined) {
    return { ...ssl, [pathKey]: parameter.value }
  }
  if (SSL_MODE_KEYS.has(parameter.key) || parameter.key === SSL_SWITCH_KEY) {
    return { ...ssl, mode: sslModeOf(parameter, warnings) }
  }
  warnings.push(`Ignored the URL parameter "${parameter.key}"`)
  return ssl
}

function sslModeOf({ key, value }: Parameter, warnings: string[]): SslMode {
  const normalized = value.toLowerCase().replaceAll('_', '-')
  const isSwitch = key === SSL_SWITCH_KEY
  const mode = (isSwitch ? SSL_SWITCH : SSL_MODES).get(normalized)
  if (mode !== undefined) {
    return mode
  }
  if (!isSwitch && FALLBACK_MODES.has(normalized)) {
    warnings.push(`SSL mode "${value}" is not supported: SSL is required instead`)
    return SslMode.Require
  }
  return fail(`Invalid value "${value}" for the URL parameter "${key}"`)
}

// decodeURIComponent only fails with a URIError, on a malformed escape sequence.
function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return fail('The URL has a malformed percent-encoded character')
  }
}

function splitOnce(text: string, separator: string): readonly [string, string] {
  const index = text.indexOf(separator)
  return index === -1 ? [text, ''] : [text.slice(0, index), text.slice(index + separator.length)]
}

function beforeFirst(text: string, separator: string): string {
  return splitOnce(text, separator)[0]
}

function fail(message: string): never {
  throw new InvalidUrlError(message)
}
