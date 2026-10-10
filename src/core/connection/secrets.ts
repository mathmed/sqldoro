import { type ConnectionConfig, SshAuthMethod } from './connection.ts'

export const SecretKind = {
  Password: 'password',
  SshPassword: 'ssh-password',
  SshPassphrase: 'ssh-passphrase',
} as const

export type SecretKind = (typeof SecretKind)[keyof typeof SecretKind]

export type ConnectionSecrets = ReadonlyMap<SecretKind, string>

// The secrets a connection can use: the others are stale and should be deleted.
export function secretKindsOf(connection: ConnectionConfig): readonly SecretKind[] {
  if (connection.ssh === undefined) {
    return [SecretKind.Password]
  }
  const sshSecret =
    connection.ssh.authMethod === SshAuthMethod.Password
      ? SecretKind.SshPassword
      : SecretKind.SshPassphrase
  return [SecretKind.Password, sshSecret]
}

export function secretOf(secrets: ConnectionSecrets, kind: SecretKind): string {
  return secrets.get(kind) ?? ''
}

// The secrets a connection would use once pending changes are saved: an empty change removes one.
export function applySecretChanges(
  stored: ConnectionSecrets,
  changes: ReadonlyMap<SecretKind, string>,
): ConnectionSecrets {
  const secrets = new Map(stored)
  for (const [kind, value] of changes) {
    if (value === '') {
      secrets.delete(kind)
    } else {
      secrets.set(kind, value)
    }
  }
  return secrets
}
