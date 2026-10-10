import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  DEFAULT_SSL,
  SshAuthMethod,
  type SshTunnelOptions,
  SslMode,
  type SslOptions,
} from '../../core/connection/connection.ts'
import {
  validateDatabase,
  validateHost,
  validateName,
  validatePortText,
  validateUser,
} from '../../core/connection/fields.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { labelOf, SSH_AUTH_LABELS, SSL_MODE_DETAILS, SSL_MODE_LABELS } from '../labels.ts'
import {
  choiceField,
  choicesOf,
  fileField,
  type FormField,
  FormSection,
  secretField,
  textField,
} from './field-kinds.ts'
import type { Choice } from './prompts.ts'
import { SAFETY_FIELDS } from './safety-fields.ts'

const NO_TUNNEL = 'none'

function hasSsl({ ssl }: ConnectionConfig): boolean {
  return ssl.mode !== SslMode.Disable
}

function hasTunnel({ ssh }: ConnectionConfig): boolean {
  return ssh !== undefined
}

function usesSshAuth(method: SshAuthMethod): (connection: ConnectionConfig) => boolean {
  return ({ ssh }) => ssh?.authMethod === method
}

function withSsl(connection: ConnectionConfig, changes: Partial<SslOptions>): ConnectionConfig {
  return { ...connection, ssl: { ...connection.ssl, ...changes } }
}

// The tunnel fields only show with a tunnel; a new tunnel starts from the defaults.
function sshOf(connection: ConnectionConfig): SshTunnelOptions {
  return connection.ssh ?? DEFAULT_SSH_TUNNEL
}

function withSsh(
  connection: ConnectionConfig,
  changes: Partial<SshTunnelOptions>,
): ConnectionConfig {
  return { ...connection, ssh: { ...sshOf(connection), ...changes } }
}

// Turning SSL off forgets its files; the verify modes always reject unauthorized certificates.
function withSslMode(connection: ConnectionConfig, mode: SslMode): ConnectionConfig {
  if (mode === SslMode.Disable) {
    return { ...connection, ssl: DEFAULT_SSL }
  }
  return withSsl(
    connection,
    mode === SslMode.Require ? { mode } : { mode, shouldRejectUnauthorized: true },
  )
}

// A new engine brings its default port unless the user picked another one.
function withEngine(
  connection: ConnectionConfig,
  engineId: string,
  engines: EngineRegistry,
): ConnectionConfig {
  const isDefaultPort = engines.find(connection.engine)?.defaultPort === connection.port
  const port = isDefaultPort ? engines.get(engineId).defaultPort : connection.port
  return { ...connection, engine: engineId, port }
}

function withTunnel(connection: ConnectionConfig, method: TunnelChoice): ConnectionConfig {
  return method === NO_TUNNEL
    ? { ...connection, ssh: undefined }
    : withSsh(connection, { authMethod: method })
}

type TunnelChoice = SshAuthMethod | typeof NO_TUNNEL

const SSL_CHOICES: readonly Choice<SslMode>[] = choicesOf(
  Object.values(SslMode),
  SSL_MODE_LABELS,
).map((choice) => ({ ...choice, detail: labelOf(SSL_MODE_DETAILS, choice.value) }))

const TUNNEL_CHOICES: readonly Choice<TunnelChoice>[] = [
  { label: 'No tunnel', value: NO_TUNNEL },
  ...choicesOf(Object.values(SshAuthMethod), SSH_AUTH_LABELS).map((choice) => ({
    ...choice,
    label: `Through SSH, with a ${choice.label.toLowerCase()}`,
  })),
]

const CONNECTION_FIELDS: readonly FormField[] = [
  textField({
    label: 'Name',
    section: FormSection.Connection,
    issueFields: [ConnectionField.Name],
    prompt: 'A name to recognize the connection',
    read: (connection) => connection.name,
    write: (connection, name) => ({ ...connection, name }),
    validate: validateName,
  }),
  choiceField({
    label: 'Engine',
    section: FormSection.Connection,
    issueFields: [ConnectionField.Engine],
    choices: (engines) =>
      engines.engines.map((engine) => ({ label: engine.displayName, value: engine.id })),
    read: (connection) => connection.engine,
    write: withEngine,
  }),
  textField({
    label: 'Host',
    section: FormSection.Connection,
    issueFields: [ConnectionField.Host],
    prompt: 'The host name or IP address of the database server',
    read: (connection) => connection.host,
    write: (connection, host) => ({ ...connection, host }),
    validate: validateHost,
  }),
  textField({
    label: 'Port',
    section: FormSection.Connection,
    issueFields: [ConnectionField.Port],
    prompt: 'The port the database server listens on',
    read: (connection) => String(connection.port),
    write: (connection, text) => ({ ...connection, port: Number(text) }),
    validate: validatePortText,
  }),
  textField({
    label: 'User',
    section: FormSection.Connection,
    issueFields: [ConnectionField.User],
    prompt: 'The user to log in as',
    read: (connection) => connection.user,
    write: (connection, user) => ({ ...connection, user }),
    validate: validateUser,
  }),
  secretField({
    label: 'Password',
    section: FormSection.Connection,
    kind: SecretKind.Password,
    prompt: 'The password of the database user, kept in the VS Code secret storage',
    placeHolder: 'Leave empty to log in without a password',
  }),
  textField({
    label: 'Database',
    section: FormSection.Connection,
    issueFields: [ConnectionField.Database],
    prompt: 'The database to open',
    placeHolder: 'Leave empty for the default database',
    emptyText: '(default)',
    read: (connection) => connection.database,
    write: (connection, database) => ({ ...connection, database }),
    validate: validateDatabase,
  }),
]

const SECURITY_FIELDS: readonly FormField[] = [
  choiceField({
    label: 'SSL',
    section: FormSection.Security,
    issueFields: [ConnectionField.SslMode],
    choices: () => SSL_CHOICES,
    read: (connection) => connection.ssl.mode,
    write: withSslMode,
  }),
  fileField({
    label: 'CA certificate',
    section: FormSection.Security,
    issueFields: [ConnectionField.SslCaPath],
    isVisible: hasSsl,
    read: (connection) => connection.ssl.caPath,
    write: (connection, caPath) => withSsl(connection, { caPath }),
  }),
  fileField({
    label: 'Client certificate',
    section: FormSection.Security,
    issueFields: [ConnectionField.SslCertPath],
    isVisible: hasSsl,
    read: (connection) => connection.ssl.certPath,
    write: (connection, certPath) => withSsl(connection, { certPath }),
  }),
  fileField({
    label: 'Client key',
    section: FormSection.Security,
    issueFields: [ConnectionField.SslKeyPath],
    isVisible: hasSsl,
    read: (connection) => connection.ssl.keyPath,
    write: (connection, keyPath) => withSsl(connection, { keyPath }),
  }),
  choiceField({
    label: 'Unauthorized certificates',
    section: FormSection.Security,
    isVisible: (connection) => connection.ssl.mode === SslMode.Require,
    choices: () => [
      { label: 'Reject them (recommended)', value: true },
      { label: 'Accept them: encrypt without checking the server', value: false },
    ],
    read: (connection) => connection.ssl.shouldRejectUnauthorized,
    write: (connection, shouldRejectUnauthorized) =>
      withSsl(connection, { shouldRejectUnauthorized }),
  }),
]

const TUNNEL_FIELDS: readonly FormField[] = [
  choiceField({
    label: 'Tunnel',
    section: FormSection.Tunnel,
    choices: () => TUNNEL_CHOICES,
    read: (connection): TunnelChoice => connection.ssh?.authMethod ?? NO_TUNNEL,
    write: withTunnel,
  }),
  textField({
    label: 'SSH host',
    section: FormSection.Tunnel,
    issueFields: [ConnectionField.SshHost],
    isVisible: hasTunnel,
    prompt: 'The SSH server that can reach the database',
    read: (connection) => sshOf(connection).host,
    write: (connection, host) => withSsh(connection, { host }),
    validate: validateHost,
  }),
  textField({
    label: 'SSH port',
    section: FormSection.Tunnel,
    issueFields: [ConnectionField.SshPort],
    isVisible: hasTunnel,
    prompt: 'The port of the SSH server',
    read: (connection) => String(sshOf(connection).port),
    write: (connection, text) => withSsh(connection, { port: Number(text) }),
    validate: validatePortText,
  }),
  textField({
    label: 'SSH user',
    section: FormSection.Tunnel,
    issueFields: [ConnectionField.SshUser],
    isVisible: hasTunnel,
    prompt: 'The user to log in to the SSH server as',
    read: (connection) => sshOf(connection).user,
    write: (connection, user) => withSsh(connection, { user }),
    validate: validateUser,
  }),
  secretField({
    label: 'SSH password',
    section: FormSection.Tunnel,
    kind: SecretKind.SshPassword,
    isVisible: usesSshAuth(SshAuthMethod.Password),
    prompt: 'The password of the SSH user, kept in the VS Code secret storage',
    placeHolder: 'The SSH password',
  }),
  fileField({
    label: 'Private key',
    section: FormSection.Tunnel,
    issueFields: [ConnectionField.SshPrivateKeyPath],
    isVisible: usesSshAuth(SshAuthMethod.PrivateKey),
    read: (connection) => sshOf(connection).privateKeyPath,
    write: (connection, privateKeyPath) => withSsh(connection, { privateKeyPath }),
  }),
  secretField({
    label: 'Passphrase',
    section: FormSection.Tunnel,
    kind: SecretKind.SshPassphrase,
    isVisible: usesSshAuth(SshAuthMethod.PrivateKey),
    prompt: 'The passphrase of the private key, kept in the VS Code secret storage',
    placeHolder: 'Leave empty if the key has no passphrase',
  }),
]

export const FORM_FIELDS: readonly FormField[] = [
  ...CONNECTION_FIELDS,
  ...SECURITY_FIELDS,
  ...TUNNEL_FIELDS,
  ...SAFETY_FIELDS,
]
