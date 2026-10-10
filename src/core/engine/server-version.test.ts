import { describe, expect, it } from 'vitest'

import { shortServerVersion } from './server-version.ts'

describe('shortServerVersion', () => {
  it.each([
    ['8.0.45', '8.0.45'],
    ['8.4.11', '8.4.11'],
    ['16.4', '16.4'],
    ['18', '18'],
    ['8.0.45-log', '8.0.45'],
    ['5.7.44-48', '5.7.44'],
    ['16.4 (Debian 16.4-1.pgdg120+1)', '16.4'],
    ['10.11.6-MariaDB-0+deb12u1', '10.11.6'],
  ])('should shorten %s to %s', (version, short) => {
    expect(shortServerVersion(version)).toBe(short)
  })

  it.each(['', 'v8.0', 'unknown 8.0', '.8.0'])(
    'should say nothing of "%s", which does not start with a number',
    (version) => {
      expect(shortServerVersion(version)).toBe('')
    },
  )
})
