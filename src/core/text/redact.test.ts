import { describe, expect, it } from 'vitest'

import { redactSecrets } from './redact.ts'

describe('redactSecrets', () => {
  it('should mask every occurrence of each secret', () => {
    expect(redactSecrets('s3cret failed: s3cret', ['s3cret'])).toBe('*** failed: ***')
  })

  it('should mask the longest secret first so that no part of it remains', () => {
    expect(redactSecrets('passphrase: hunter2-long', ['hunter2', 'hunter2-long'])).toBe(
      'passphrase: ***',
    )
  })

  it('should ignore empty secrets', () => {
    expect(redactSecrets('nothing to hide', [''])).toBe('nothing to hide')
  })

  it('should mask the password of a URL', () => {
    expect(
      redactSecrets('cannot open postgres://app:pa55@db:5432/shop or mysql://root:x@h', []),
    ).toBe('cannot open postgres://app:***@db:5432/shop or mysql://root:***@h')
  })

  it('should keep a URL without a password as it is', () => {
    expect(redactSecrets('see mysql://root@db/shop and https://example.com/a:b', [])).toBe(
      'see mysql://root@db/shop and https://example.com/a:b',
    )
  })
})
