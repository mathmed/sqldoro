import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { EngineRegistry } from '../engine/engine-registry.ts'
import { DEFAULT_SSL, EnvironmentTag, SslMode } from './connection.ts'
import { type ImportedConnection, parseConnectionUrl, type UrlImportContext } from './url.ts'

const MYSQL = fakeEngine({ id: 'mysql', defaultPort: 3306, urlSchemes: ['mysql'] })
const POSTGRES = fakeEngine({
  id: 'postgres',
  defaultPort: 5432,
  urlSchemes: ['postgres', 'postgresql'],
})
const CONTEXT: UrlImportContext = {
  engines: new EngineRegistry([MYSQL, POSTGRES]),
  id: 'new-id',
  takenNameKeys: new Set(),
}
const SCHEMES = 'mysql://, postgres:// or postgresql://'

function imported(url: string, context: UrlImportContext = CONTEXT): ImportedConnection {
  const result = parseConnectionUrl(url, context)
  if (!result.isValid) {
    throw new Error(`expected a valid URL, got: ${result.message}`)
  }
  return result.imported
}

function problemOf(url: string, context: UrlImportContext = CONTEXT): string {
  const result = parseConnectionUrl(url, context)
  if (result.isValid) {
    throw new Error('expected an invalid URL')
  }
  return result.message
}

describe('parseConnectionUrl', () => {
  it('should import every part of a complete URL', () => {
    const sut = imported(
      'postgres://app:s%40cret@db.example.com:6543/shop?sslmode=verify-full&sslrootcert=%2Fcerts%2Fca.pem',
    )

    expect(sut).toStrictEqual({
      connection: {
        id: 'new-id',
        name: 'db.example.com/shop',
        engine: 'postgres',
        host: 'db.example.com',
        port: 6543,
        user: 'app',
        database: 'shop',
        ssl: { ...DEFAULT_SSL, mode: SslMode.VerifyFull, caPath: '/certs/ca.pem' },
        ssh: undefined,
        environment: EnvironmentTag.None,
        isReadOnly: true,
        color: '',
        folder: '',
      },
      password: 's@cret',
      warnings: [],
    })
  })

  it.each([
    ['postgresql://db/app', 'postgres'],
    ['PostgreSQL://db/app', 'postgres'],
    ['MYSQL://db/app', 'mysql'],
  ])('should pick the engine of %s', (url, engine) => {
    expect(imported(url).connection.engine).toBe(engine)
  })

  it('should ignore the spaces around the URL', () => {
    expect(imported('  mysql://root@db  ').connection.host).toBe('db')
  })

  it.each(['mysql://db', 'mysql://db:', 'mysql://db/'])(
    'should use the default port of the engine for %s',
    (url) => {
      expect(imported(url).connection.port).toBe(3306)
    },
  )

  it('should leave the user and the password empty when the URL has none', () => {
    expect(imported('mysql://db')).toMatchObject({ connection: { user: '' }, password: '' })
  })

  it('should read a user without a password', () => {
    expect(imported('mysql://root@db')).toMatchObject({
      connection: { user: 'root' },
      password: '',
    })
  })

  it('should keep the colons of a password after the first one', () => {
    expect(imported('mysql://root:pa:ss@db').password).toBe('pa:ss')
  })

  it('should split the user information at the last @', () => {
    expect(imported('mysql://root:p@ss@db')).toMatchObject({
      connection: { user: 'root', host: 'db' },
      password: 'p@ss',
    })
  })

  it('should decode the user, the host and the database', () => {
    const sut = imported('postgres://my%20user@d%62/my%20db').connection

    expect(sut).toMatchObject({ user: 'my user', host: 'db', database: 'my db' })
  })

  it.each([
    ['postgres://[::1]:5433/app', 5433],
    ['postgres://[::1]/app', 5432],
    ['postgres://[::1]', 5432],
  ])('should read the IPv6 host of %s', (url, port) => {
    expect(imported(url).connection).toMatchObject({ host: '::1', port })
  })

  it('should name the connection after the host when there is no database', () => {
    expect(imported('mysql://db.local').connection).toMatchObject({
      name: 'db.local',
      database: '',
    })
  })

  it('should give the connection a name nobody uses', () => {
    const context = { ...CONTEXT, takenNameKeys: new Set(['db/shop', 'db/shop (2)']) }

    expect(imported('mysql://db/shop', context).connection.name).toBe('db/shop (3)')
  })

  it('should ignore the fragment', () => {
    expect(imported('mysql://db/shop?ssl=true#section').connection).toMatchObject({
      database: 'shop',
      ssl: { mode: SslMode.Require },
    })
  })

  describe('SSL parameters', () => {
    it.each([
      ['sslmode=disable', SslMode.Disable],
      ['ssl-mode=DISABLED', SslMode.Disable],
      ['sslmode=require', SslMode.Require],
      ['ssl-mode=REQUIRED', SslMode.Require],
      ['sslmode=verify-ca', SslMode.VerifyCa],
      ['ssl-mode=VERIFY_CA', SslMode.VerifyCa],
      ['sslmode=verify-full', SslMode.VerifyFull],
      ['ssl-mode=VERIFY_IDENTITY', SslMode.VerifyFull],
      ['ssl=true', SslMode.Require],
      ['ssl=1', SslMode.Require],
      ['ssl=TRUE', SslMode.Require],
      ['ssl=false', SslMode.Disable],
      ['ssl=0', SslMode.Disable],
    ])('should read %s', (parameter, mode) => {
      expect(imported(`mysql://db?${parameter}`)).toMatchObject({
        connection: { ssl: { mode } },
        warnings: [],
      })
    })

    it.each(['prefer', 'allow', 'PREFERRED'])(
      'should require SSL instead of falling back to plain text with %s',
      (value) => {
        expect(imported(`postgres://db?sslmode=${value}`)).toMatchObject({
          connection: { ssl: { mode: SslMode.Require } },
          warnings: [`SSL mode "${value}" is not supported: SSL is required instead`],
        })
      },
    )

    it('should read the certificate files of both URL dialects', () => {
      const libpq = imported('postgres://db?sslmode=require&sslrootcert=/a&sslcert=/b&sslkey=/c')
      const mysql = imported('mysql://db?ssl-mode=REQUIRED&ssl-ca=/a&ssl-cert=/b&ssl-key=/c')

      for (const sut of [libpq, mysql]) {
        expect(sut.connection.ssl).toStrictEqual({
          ...DEFAULT_SSL,
          mode: SslMode.Require,
          caPath: '/a',
          certPath: '/b',
          keyPath: '/c',
        })
      }
    })

    it('should let the last SSL parameter win', () => {
      expect(imported('mysql://db?ssl=true&ssl-mode=DISABLED').connection.ssl.mode).toBe(
        SslMode.Disable,
      )
    })

    it('should warn about the parameters it ignores', () => {
      expect(
        imported('postgres://db?connect_timeout=10&&application_name=x&flag').warnings,
      ).toStrictEqual([
        'Ignored the URL parameter "connect_timeout"',
        'Ignored the URL parameter "application_name"',
        'Ignored the URL parameter "flag"',
      ])
    })

    it.each([
      ['sslmode=bogus', 'Invalid value "bogus" for the URL parameter "sslmode"'],
      ['ssl=prefer', 'Invalid value "prefer" for the URL parameter "ssl"'],
      ['ssl=yes', 'Invalid value "yes" for the URL parameter "ssl"'],
      ['ssl-mode=', 'Invalid value "" for the URL parameter "ssl-mode"'],
    ])('should reject %s', (parameter, message) => {
      expect(problemOf(`mysql://db?${parameter}`)).toBe(message)
    })
  })

  describe('invalid URLs', () => {
    it.each(['localhost:5432', 'db', '', '://db', '1sql://db', 'my sql://db'])(
      'should ask for a URL with a scheme instead of %j',
      (url) => {
        expect(problemOf(url)).toBe(`Enter a connection URL that starts with ${SCHEMES}`)
      },
    )

    it('should name the only scheme when there is one engine', () => {
      const context = { ...CONTEXT, engines: new EngineRegistry([MYSQL]) }

      expect(problemOf('db', context)).toBe('Enter a connection URL that starts with mysql://')
    })

    it('should not list schemes when no engine is registered', () => {
      const context = { ...CONTEXT, engines: new EngineRegistry([]) }

      expect(problemOf('db', context)).toBe('Enter a connection URL that starts with ')
    })

    it('should reject a scheme no engine handles', () => {
      expect(problemOf('mongodb://db')).toBe(`Unsupported URL scheme "mongodb": use ${SCHEMES}`)
    })

    it.each([
      ['postgres://user@/db', 'The URL has no host'],
      ['postgres:///db', 'The URL has no host'],
      ['postgres://user:secret@', 'The URL has no host'],
      ['postgres://h1,h2/db', 'URLs with several hosts are not supported'],
      ['postgres://h1:5432,h2:5433/db', 'URLs with several hosts are not supported'],
      ['postgres://%2Fvar%2Frun%2Fpostgresql/db', 'Unix socket connections are not supported'],
      ['postgres://db:abc/app', 'Invalid port "abc" in the URL'],
      ['postgres://db:0/app', 'Invalid port "0" in the URL'],
      ['postgres://db:65536/app', 'Invalid port "65536" in the URL'],
      ['postgres://::1/app', 'Write IPv6 addresses in brackets, such as [::1]'],
      ['postgres://[::1/app', 'The IPv6 address of the URL is malformed'],
      ['postgres://[::1]x/app', 'The IPv6 address of the URL is malformed'],
      ['postgres://db/shop/extra', 'The URL path can only hold the database name'],
      ['postgres://db/shop%2Fextra', 'The URL path can only hold the database name'],
      ['postgres://us%ZZer@db', 'The URL has a malformed percent-encoded character'],
      ['postgres://us%E0%A4@db', 'The URL has a malformed percent-encoded character'],
      ['postgres://db?sslrootcert=%', 'The URL has a malformed percent-encoded character'],
    ])('should reject %s', (url, message) => {
      expect(problemOf(url)).toBe(message)
    })

    it('should let unexpected errors through', () => {
      const failingNames = new (class extends Set<string> {
        override has(): boolean {
          throw new Error('storage failure')
        }
      })()

      expect(() =>
        parseConnectionUrl('mysql://db', { ...CONTEXT, takenNameKeys: failingNames }),
      ).toThrow('storage failure')
    })
  })
})
