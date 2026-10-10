import { describe, expect, it } from 'vitest'

import { sha256Fingerprint } from './fingerprint.ts'

// A public host key and what `ssh-keygen -lf` prints for it.
const PUBLIC_KEY = 'AAAAC3NzaC1lZDI1NTE5AAAAIA4gXFq7y0uraB093VLclZaxSspPEMJHo4d/hRfSjZtk'
const OPENSSH_FINGERPRINT = 'SHA256:gjWZoaQxz1+N1wOXtBKywv661njpI6W2deB6lJ1fayc'

describe('sha256Fingerprint', () => {
  it('should print the fingerprint OpenSSH prints for the same key', () => {
    expect(sha256Fingerprint(Buffer.from(PUBLIC_KEY, 'base64'))).toBe(OPENSSH_FINGERPRINT)
  })

  it('should drop the base64 padding', () => {
    expect(sha256Fingerprint(new TextEncoder().encode('host key'))).toBe(
      'SHA256:+xspGuW/PEF/5qpDMzUSFm9CUN7eQpfJk+E1hh4AsL0',
    )
  })
})
