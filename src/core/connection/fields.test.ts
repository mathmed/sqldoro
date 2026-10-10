import { describe, expect, it } from 'vitest'

import {
  parsePort,
  validateDatabase,
  validateHost,
  validateName,
  validatePath,
  validatePort,
  validatePortText,
  validateUser,
} from './fields.ts'

const PORT_PROBLEM = 'The port must be a whole number from 1 to 65535'

describe('validateName', () => {
  it('should accept a name', () => {
    expect(validateName('Shop (prod)')).toBeUndefined()
  })

  it.each(['', '   '])('should ask for a name when it is %j', (name) => {
    expect(validateName(name)).toBe('Enter a name for the connection')
  })

  it('should accept 100 characters', () => {
    expect(validateName('n'.repeat(100))).toBeUndefined()
  })

  it('should reject more than 100 characters', () => {
    expect(validateName('n'.repeat(101))).toBe('The name must have at most 100 characters')
  })

  it.each(['tab\there', 'line\nbreak', 'nul\u0000', 'delete\u007f', '\u001f'])(
    'should reject the control character in %j',
    (name) => {
      expect(validateName(name)).toBe('The name cannot contain control characters')
    },
  )

  it('should accept the first printable character and the one after delete', () => {
    expect(validateName(' x')).toBeUndefined()
    expect(validateName('\u0080x')).toBeUndefined()
  })
})

describe('validateHost', () => {
  it.each(['db.example.com', '192.0.2.10', '::1', 'host_name'])('should accept %s', (host) => {
    expect(validateHost(host)).toBeUndefined()
  })

  it('should ask for a host when it is empty', () => {
    expect(validateHost('')).toBe('Enter the host name or IP address of the server')
  })

  it.each(['db example', 'db/x', 'db?x', 'db#x', 'user@db', 'h1,h2', ' db', 'db\t'])(
    'should reject the delimiter in %j',
    (host) => {
      expect(validateHost(host)).toBe('The host cannot contain spaces or the characters / ? # @ ,')
    },
  )

  it('should accept 253 characters and reject 254', () => {
    expect(validateHost('h'.repeat(253))).toBeUndefined()
    expect(validateHost('h'.repeat(254))).toBe('The host must have at most 253 characters')
  })

  it('should reject a control character', () => {
    expect(validateHost('db\u0000')).toBe('The host cannot contain control characters')
  })
})

describe('validateUser', () => {
  it('should accept a user', () => {
    expect(validateUser('app_user')).toBeUndefined()
  })

  it('should ask for a user when it is empty', () => {
    expect(validateUser('')).toBe('Enter the user to log in as')
  })

  it('should accept 255 characters and reject 256', () => {
    expect(validateUser('u'.repeat(255))).toBeUndefined()
    expect(validateUser('u'.repeat(256))).toBe('The user must have at most 255 characters')
  })

  it('should reject a control character', () => {
    expect(validateUser('a\nb')).toBe('The user cannot contain control characters')
  })
})

describe('validateDatabase', () => {
  it('should accept an empty database, the default of the engine', () => {
    expect(validateDatabase('')).toBeUndefined()
  })

  it('should accept 255 characters and reject 256', () => {
    expect(validateDatabase('d'.repeat(255))).toBeUndefined()
    expect(validateDatabase('d'.repeat(256))).toBe('The database must have at most 255 characters')
  })

  it('should reject a control character', () => {
    expect(validateDatabase('shop\r')).toBe('The database cannot contain control characters')
  })
})

describe('validatePath', () => {
  it('should accept an empty path and a path with spaces', () => {
    expect(validatePath('')).toBeUndefined()
    expect(validatePath('/home/me/My Certs/ca.pem')).toBeUndefined()
  })

  it('should accept 4096 characters and reject 4097', () => {
    expect(validatePath('p'.repeat(4096))).toBeUndefined()
    expect(validatePath('p'.repeat(4097))).toBe('The path must have at most 4096 characters')
  })

  it('should reject a control character', () => {
    expect(validatePath('/certs/\u0007')).toBe('The path cannot contain control characters')
  })
})

describe('parsePort', () => {
  it.each([
    ['1', 1],
    ['3306', 3306],
    ['65535', 65_535],
    ['00080', 80],
  ])('should read %s as %i', (text, port) => {
    expect(parsePort(text)).toBe(port)
  })

  it.each(['', '0', '65536', '-1', '3.5', '1e3', ' 80', '80 ', 'abc', '0x50'])(
    'should not read %j as a port',
    (text) => {
      expect(parsePort(text)).toBeUndefined()
    },
  )
})

describe('validatePortText', () => {
  it('should accept a port', () => {
    expect(validatePortText('5432')).toBeUndefined()
  })

  it('should explain the valid ports', () => {
    expect(validatePortText('70000')).toBe(PORT_PROBLEM)
  })
})

describe('validatePort', () => {
  it.each([1, 22, 65_535])('should accept %i', (port) => {
    expect(validatePort(port)).toBeUndefined()
  })

  it.each([0, 65_536, -22, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'should reject %d',
    (port) => {
      expect(validatePort(port)).toBe(PORT_PROBLEM)
    },
  )
})
