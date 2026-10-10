import { describe, expect, it } from 'vitest'

import { readFileFor } from './platform.ts'

describe('readFileFor', () => {
  it('should return the text of the file', async () => {
    const files = { readText: async (path: string) => Promise.resolve(`text of ${path}`) }

    await expect(readFileFor(files, '/ca.pem', 'CA certificate')).resolves.toBe('text of /ca.pem')
  })

  it('should say which file could not be read and why', async () => {
    const cause = new Error('ENOENT: no such file or directory')
    const files = { readText: async () => Promise.reject(cause) }

    const sut = readFileFor(files, '/missing.pem', 'CA certificate')

    await expect(sut).rejects.toThrow(
      'Could not read the CA certificate file "/missing.pem": ENOENT: no such file or directory',
    )
    await expect(sut).rejects.toHaveProperty('cause', cause)
  })
})
