import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { localFiles } from './local-files.ts'

let directory: string

describe('localFiles', () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sqldoro-files-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('should read a file as text', async () => {
    const path = join(directory, 'ca.pem')
    await writeFile(path, '-----BEGIN CERTIFICATE-----\n')

    await expect(localFiles.readText(path)).resolves.toBe('-----BEGIN CERTIFICATE-----\n')
  })

  it('should read a path that starts with ~/ from the home directory', async () => {
    const path = join(directory, 'id_ed25519')
    await writeFile(path, 'key')
    const fromHome = `~/${relative(homedir(), path)}`

    await expect(localFiles.readText(fromHome)).resolves.toBe('key')
  })

  it('should fail for a file that does not exist', async () => {
    await expect(localFiles.readText(join(directory, 'missing.pem'))).rejects.toThrow('ENOENT')
  })
})
