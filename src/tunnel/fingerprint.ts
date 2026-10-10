import { createHash } from 'node:crypto'

// The format OpenSSH shows (ssh-keygen -l), so that users can compare it with the server's.
export function sha256Fingerprint(key: Uint8Array): string {
  const digest = createHash('sha256').update(key).digest('base64').replaceAll('=', '')
  return `SHA256:${digest}`
}
