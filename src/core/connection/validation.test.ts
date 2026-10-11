import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import {
  type ConnectionConfig,
  DEFAULT_SSH_TUNNEL,
  DEFAULT_SSL,
  newConnection,
  SshAuthMethod,
  SslMode,
  type SslOptions,
} from './connection.ts'
import { ConnectionField, validateConnection, type ValidationContext } from './validation.ts'

const ENGINE = fakeEngine({ id: 'postgres', defaultPort: 5432 })
const CONTEXT: ValidationContext = {
  engines: [ENGINE],
  takenNameKeys: new Set(['billing']),
}
const VALID: ConnectionConfig = { ...newConnection('id', ENGINE), name: 'Shop', user: 'app' }

function issuesOf(changes: Partial<ConnectionConfig>): ReturnType<typeof validateConnection> {
  return validateConnection({ ...VALID, ...changes }, CONTEXT)
}

function sslIssues(ssl: Partial<SslOptions>): ReturnType<typeof validateConnection> {
  return issuesOf({ ssl: { ...DEFAULT_SSL, ...ssl } })
}

describe('validateConnection', () => {
  it('should accept a complete connection', () => {
    expect(validateConnection(VALID, CONTEXT)).toStrictEqual([])
  })

  it('should report every problem with its field', () => {
    expect(issuesOf({ name: '', host: '', port: 0, user: '', database: 'a\nb' })).toStrictEqual([
      { field: ConnectionField.Name, message: 'Enter a name for the connection' },
      { field: ConnectionField.Host, message: 'Enter the host name or IP address of the server' },
      { field: ConnectionField.Port, message: 'The port must be a whole number from 1 to 65535' },
      { field: ConnectionField.User, message: 'Enter the user to log in as' },
      {
        field: ConnectionField.Database,
        message: 'The database cannot contain control characters',
      },
    ])
  })

  it('should reject a name another connection uses, whatever its case', () => {
    expect(issuesOf({ name: ' BILLING ' })).toStrictEqual([
      { field: ConnectionField.Name, message: 'Another connection is already named "BILLING"' },
    ])
  })

  it('should reject a folder it cannot keep', () => {
    expect(issuesOf({ folder: 'clients\tacme' })).toStrictEqual([
      { field: ConnectionField.Folder, message: 'The folder cannot contain control characters' },
    ])
    expect(issuesOf({ folder: 'clients/acme' })).toStrictEqual([])
  })

  it('should reject an engine that is not registered', () => {
    expect(issuesOf({ engine: 'oracle' })).toStrictEqual([
      { field: ConnectionField.Engine, message: 'Unknown database engine "oracle"' },
    ])
  })

  describe('SSL', () => {
    it.each([SslMode.Require, SslMode.VerifyCa, SslMode.VerifyFull])(
      'should accept %s with certificate files',
      (mode) => {
        expect(
          sslIssues({ mode, caPath: '/ca.pem', certPath: '/c.pem', keyPath: '/k.pem' }),
        ).toStrictEqual([])
      },
    )

    it('should accept require without rejecting unauthorized certificates', () => {
      expect(sslIssues({ mode: SslMode.Require, shouldRejectUnauthorized: false })).toStrictEqual(
        [],
      )
    })

    it.each([
      { file: 'a CA', ssl: { caPath: '/ca.pem' } },
      { file: 'a certificate and its key', ssl: { certPath: '/c.pem', keyPath: '/k.pem' } },
    ])('should ask for an SSL mode before using $file', ({ ssl }) => {
      expect(sslIssues(ssl)).toStrictEqual([
        { field: ConnectionField.SslMode, message: 'Choose an SSL mode to use certificate files' },
      ])
    })

    it('should accept SSL disabled without rejecting unauthorized certificates', () => {
      expect(sslIssues({ shouldRejectUnauthorized: false })).toStrictEqual([])
    })

    it.each([SslMode.VerifyCa, SslMode.VerifyFull])(
      'should refuse %s without rejecting unauthorized certificates',
      (mode) => {
        expect(sslIssues({ mode, shouldRejectUnauthorized: false })).toStrictEqual([
          {
            field: ConnectionField.SslMode,
            message: 'verify-ca and verify-full always reject unauthorized certificates',
          },
        ])
      },
    )

    it('should ask for the key of a client certificate', () => {
      expect(sslIssues({ mode: SslMode.Require, certPath: '/c.pem' })).toStrictEqual([
        {
          field: ConnectionField.SslKeyPath,
          message: 'A client certificate needs its private key',
        },
      ])
    })

    it('should ask for the certificate of a client key', () => {
      expect(sslIssues({ mode: SslMode.Require, keyPath: '/k.pem' })).toStrictEqual([
        { field: ConnectionField.SslCertPath, message: 'A client key needs its certificate' },
      ])
    })

    it('should reject control characters in each certificate path', () => {
      const bad = '/bad\u0000'

      expect(
        sslIssues({ mode: SslMode.Require, caPath: bad, certPath: bad, keyPath: bad }),
      ).toStrictEqual([
        { field: ConnectionField.SslCaPath, message: 'The path cannot contain control characters' },
        {
          field: ConnectionField.SslCertPath,
          message: 'The path cannot contain control characters',
        },
        {
          field: ConnectionField.SslKeyPath,
          message: 'The path cannot contain control characters',
        },
      ])
    })
  })

  describe('SSH tunnel', () => {
    const tunnel = { ...DEFAULT_SSH_TUNNEL, host: 'bastion', user: 'me' }

    it('should accept a tunnel with a password', () => {
      expect(issuesOf({ ssh: tunnel })).toStrictEqual([])
    })

    it('should accept a tunnel with a private key', () => {
      const ssh = { ...tunnel, authMethod: SshAuthMethod.PrivateKey, privateKeyPath: '/id_ed25519' }

      expect(issuesOf({ ssh })).toStrictEqual([])
    })

    it('should report the problems of the tunnel', () => {
      const ssh = { ...tunnel, host: '', port: 70_000, user: '' }

      expect(issuesOf({ ssh })).toStrictEqual([
        {
          field: ConnectionField.SshHost,
          message: 'Enter the host name or IP address of the server',
        },
        {
          field: ConnectionField.SshPort,
          message: 'The port must be a whole number from 1 to 65535',
        },
        { field: ConnectionField.SshUser, message: 'Enter the SSH user' },
      ])
    })

    it('should reject an SSH user that is too long', () => {
      expect(issuesOf({ ssh: { ...tunnel, user: 'u'.repeat(256) } })).toStrictEqual([
        { field: ConnectionField.SshUser, message: 'The user must have at most 255 characters' },
      ])
    })

    it('should ask for the private key file', () => {
      const ssh = { ...tunnel, authMethod: SshAuthMethod.PrivateKey }

      expect(issuesOf({ ssh })).toStrictEqual([
        { field: ConnectionField.SshPrivateKeyPath, message: 'Choose the private key file' },
      ])
    })

    it('should reject control characters in the private key path', () => {
      const ssh = { ...tunnel, authMethod: SshAuthMethod.PrivateKey, privateKeyPath: '/k\u0000' }

      expect(issuesOf({ ssh })).toStrictEqual([
        {
          field: ConnectionField.SshPrivateKeyPath,
          message: 'The path cannot contain control characters',
        },
      ])
    })

    it('should ignore a leftover key path when the tunnel uses a password', () => {
      expect(issuesOf({ ssh: { ...tunnel, privateKeyPath: '/k\u0000' } })).toStrictEqual([])
    })
  })
})
