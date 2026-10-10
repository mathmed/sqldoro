import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  appendText,
  fileSize,
  listFiles,
  makeTemporaryDirectory,
  readText,
  removeDirectory,
  writeText,
} from './files.ts'
import { compareText } from './text.ts'

describe('files', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sqldoro-files-'))
  })

  it('should write, append and read text, creating missing folders', async () => {
    const path = join(directory, 'nested', 'report.md')

    await writeText(path, 'first')
    await appendText(path, ' second')

    expect(await readText(path)).toBe('first second')
  })

  it('should tell the size of a file in bytes', async () => {
    const path = join(directory, 'bundle.js')
    await writeText(path, 'abcdé')

    expect(await fileSize(path)).toBe(6)
  })

  it('should list the files of a folder', async () => {
    await writeText(join(directory, 'b.json'), '{}')
    await writeText(join(directory, 'a.json'), '{}')

    expect((await listFiles(directory)).toSorted(compareText)).toEqual(['a.json', 'b.json'])
  })

  it('should list nothing when the folder does not exist', async () => {
    expect(await listFiles(join(directory, 'missing'))).toEqual([])
  })

  it('should not hide other errors while listing a folder', async () => {
    const file = join(directory, 'file.txt')
    await writeText(file, 'not a folder')

    await expect(listFiles(file)).rejects.toThrow('ENOTDIR')
  })

  it('should make a new empty folder in the temporary folder of the system', async () => {
    const made = await makeTemporaryDirectory('sqldoro-files-made-')
    const another = await makeTemporaryDirectory('sqldoro-files-made-')

    expect(made.startsWith(join(tmpdir(), 'sqldoro-files-made-'))).toBe(true)
    expect(await listFiles(made)).toEqual([])
    expect(another).not.toBe(made)
    await Promise.all([removeDirectory(made), removeDirectory(another)])
  })

  it('should remove a folder and tolerate one that is already gone', async () => {
    await writeText(join(directory, 'inner', 'file.txt'), 'x')

    await removeDirectory(join(directory, 'inner'))
    await removeDirectory(join(directory, 'inner'))

    expect(await listFiles(directory)).toEqual([])
  })
})
