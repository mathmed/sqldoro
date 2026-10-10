import { describe, expect, it } from 'vitest'

import { assessHostKey, HostKeyStatus } from './host-key.ts'

describe('assessHostKey', () => {
  it('should not know a server it has never seen', () => {
    expect(assessHostKey(undefined, 'SHA256:abc')).toBe(HostKeyStatus.Unknown)
  })

  it('should trust a server that presents the key it presented before', () => {
    expect(assessHostKey('SHA256:abc', 'SHA256:abc')).toBe(HostKeyStatus.Trusted)
  })

  it('should notice a server whose key changed', () => {
    expect(assessHostKey('SHA256:abc', 'SHA256:xyz')).toBe(HostKeyStatus.Changed)
  })
})
