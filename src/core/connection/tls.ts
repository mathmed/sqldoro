import type { TlsSettings } from '../engine/engine.ts'
import { type FileReader, readFileFor } from '../platform.ts'
import { SslMode, type SslOptions } from './connection.ts'

interface Verification {
  readonly shouldVerifyCertificate: boolean
  readonly shouldVerifyHostname: boolean
}

export async function resolveTls(
  ssl: SslOptions,
  serverName: string,
  files: FileReader,
): Promise<TlsSettings | undefined> {
  if (ssl.mode === SslMode.Disable) {
    return undefined
  }
  const [ca, cert, key] = await Promise.all([
    readOptional(files, ssl.caPath, 'CA certificate'),
    readOptional(files, ssl.certPath, 'client certificate'),
    readOptional(files, ssl.keyPath, 'client key'),
  ])
  return { serverName, ...verificationOf(ssl.mode, ssl.shouldRejectUnauthorized), ca, cert, key }
}

function verificationOf(mode: SslMode, shouldRejectUnauthorized: boolean): Verification {
  switch (mode) {
    case SslMode.VerifyCa:
      return { shouldVerifyCertificate: true, shouldVerifyHostname: false }
    case SslMode.VerifyFull:
      return { shouldVerifyCertificate: true, shouldVerifyHostname: true }
    default:
      return {
        shouldVerifyCertificate: shouldRejectUnauthorized,
        shouldVerifyHostname: shouldRejectUnauthorized,
      }
  }
}

async function readOptional(
  files: FileReader,
  path: string,
  purpose: string,
): Promise<string | undefined> {
  return path === '' ? undefined : readFileFor(files, path, purpose)
}
