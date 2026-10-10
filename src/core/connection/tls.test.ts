import { describe, expect, it } from 'vitest'

import { DEFAULT_SSL, SslMode, type SslOptions } from './connection.ts'
import { resolveTls } from './tls.ts'

const FILES = { readText: async (path: string) => Promise.resolve(`PEM of ${path}`) }

async function resolve(ssl: Partial<SslOptions>): ReturnType<typeof resolveTls> {
  return resolveTls({ ...DEFAULT_SSL, ...ssl }, 'db.example.com', FILES)
}

describe('resolveTls', () => {
  it('should not use TLS when SSL is disabled, even with files', async () => {
    await expect(resolve({ caPath: '/ca.pem' })).resolves.toBeUndefined()
  })

  it('should verify the certificate and the host name with require by default', async () => {
    await expect(resolve({ mode: SslMode.Require })).resolves.toStrictEqual({
      serverName: 'db.example.com',
      shouldVerifyCertificate: true,
      shouldVerifyHostname: true,
      ca: undefined,
      cert: undefined,
      key: undefined,
    })
  })

  it('should only encrypt with require when unauthorized certificates are accepted', async () => {
    await expect(
      resolve({ mode: SslMode.Require, shouldRejectUnauthorized: false }),
    ).resolves.toMatchObject({
      shouldVerifyCertificate: false,
      shouldVerifyHostname: false,
    })
  })

  it('should verify the certificate but not the host name with verify-ca', async () => {
    await expect(resolve({ mode: SslMode.VerifyCa })).resolves.toMatchObject({
      shouldVerifyCertificate: true,
      shouldVerifyHostname: false,
    })
  })

  it('should always verify with the verify modes, whatever the reject flag says', async () => {
    await expect(
      resolve({ mode: SslMode.VerifyCa, shouldRejectUnauthorized: false }),
    ).resolves.toMatchObject({
      shouldVerifyCertificate: true,
      shouldVerifyHostname: false,
    })
    await expect(
      resolve({ mode: SslMode.VerifyFull, shouldRejectUnauthorized: false }),
    ).resolves.toMatchObject({
      shouldVerifyCertificate: true,
      shouldVerifyHostname: true,
    })
  })

  it('should verify the certificate and the host name with verify-full', async () => {
    await expect(resolve({ mode: SslMode.VerifyFull })).resolves.toMatchObject({
      shouldVerifyCertificate: true,
      shouldVerifyHostname: true,
    })
  })

  it('should read the certificate files that are set', async () => {
    const sut = await resolve({
      mode: SslMode.VerifyFull,
      caPath: '/ca',
      certPath: '/c',
      keyPath: '/k',
    })

    expect(sut).toMatchObject({ ca: 'PEM of /ca', cert: 'PEM of /c', key: 'PEM of /k' })
  })

  it('should say which certificate file could not be read', async () => {
    const files = { readText: async () => Promise.reject(new Error('EACCES')) }
    const ssl = { ...DEFAULT_SSL, mode: SslMode.Require, certPath: '/c', keyPath: '/k' }

    await expect(resolveTls(ssl, 'db', files)).rejects.toThrow(
      'Could not read the client certificate file "/c": EACCES',
    )
  })

  it('should name the CA and the key files in their errors', async () => {
    const files = { readText: async () => Promise.reject(new Error('EACCES')) }

    await expect(
      resolveTls({ ...DEFAULT_SSL, mode: SslMode.Require, caPath: '/ca' }, 'db', files),
    ).rejects.toThrow('Could not read the CA certificate file "/ca": EACCES')
    await expect(
      resolveTls({ ...DEFAULT_SSL, mode: SslMode.Require, keyPath: '/k' }, 'db', files),
    ).rejects.toThrow('Could not read the client key file "/k": EACCES')
  })
})
