import { describe, expect, it } from 'vitest'

import { zipArchive } from '../../test/support/zip.ts'
import { CompressionMethod, readZipEntries, readZipEntry } from './zip.ts'

describe('readZipEntries', () => {
  it('should list the entries of an archive with their sizes', () => {
    const sut = zipArchive([
      { name: 'extension/package.json', content: '{"name":"sqldoro"}' },
      { name: 'extension/media/ñ.txt', content: 'abc', isStored: true },
    ])

    expect(readZipEntries(sut)).toMatchObject([
      { name: 'extension/package.json', size: 18, method: CompressionMethod.Deflated },
      {
        name: 'extension/media/ñ.txt',
        size: 3,
        compressedSize: 3,
        method: CompressionMethod.Stored,
      },
    ])
  })

  it('should find the end of an archive that has a comment', () => {
    const sut = zipArchive([{ name: 'a', content: 'x' }], 'c'.repeat(1000))

    expect(readZipEntries(sut).map((entry) => entry.name)).toStrictEqual(['a'])
  })

  it('should list no entry of an empty archive', () => {
    expect(readZipEntries(zipArchive([]))).toStrictEqual([])
  })

  it('should refuse what is not a ZIP archive', () => {
    expect(() => readZipEntries(Buffer.alloc(100))).toThrow(
      'not a ZIP archive: it has no end of central directory record',
    )
    expect(() => readZipEntries(Buffer.from('PK'))).toThrow('no end of central directory record')
  })

  it('should refuse a central directory that points past the archive or at something else', () => {
    const archive = zipArchive([{ name: 'a', content: 'x' }])
    const end = archive.length - 22
    const pastTheEnd = Buffer.from(archive)
    pastTheEnd.writeUInt32LE(archive.length, end + 16)
    const elsewhere = Buffer.from(archive)
    elsewhere.writeUInt32LE(1, end + 16)

    expect(() => readZipEntries(pastTheEnd)).toThrow(
      `not a ZIP archive: offset ${String(archive.length)} is past its end`,
    )
    expect(() => readZipEntries(elsewhere)).toThrow(
      'not a ZIP archive: no header where offset 1 points',
    )
  })

  it('should refuse ZIP64 archives', () => {
    const archive = zipArchive([{ name: 'a', content: 'x' }])
    const manyEntries = Buffer.from(archive)
    manyEntries.writeUInt16LE(0xffff, archive.length - 22 + 10)
    const farOffset = Buffer.from(archive)
    farOffset.writeUInt32LE(0xffffffff, archive.length - 22 + 16)

    expect(() => readZipEntries(manyEntries)).toThrow('ZIP64 archives are not supported')
    expect(() => readZipEntries(farOffset)).toThrow('ZIP64 archives are not supported')
  })
})

describe('readZipEntry', () => {
  it('should read stored and deflated entries', () => {
    const sut = zipArchive([
      { name: 'deflated', content: 'hello '.repeat(100) },
      { name: 'stored', content: 'plain', isStored: true },
    ])
    const [deflated, stored] = readZipEntries(sut)

    expect(deflated === undefined ? '' : readZipEntry(sut, deflated).toString()).toBe(
      'hello '.repeat(100),
    )
    expect(stored === undefined ? '' : readZipEntry(sut, stored).toString()).toBe('plain')
  })

  it('should refuse a compression method it does not know, or an entry that is not there', () => {
    const sut = zipArchive([{ name: 'a', content: 'x' }])
    const [entry] = readZipEntries(sut)
    if (entry === undefined) {
      throw new Error('no entry')
    }

    expect(() => readZipEntry(sut, { ...entry, method: 12 })).toThrow(
      'a: compression method 12 is not supported',
    )
    expect(() => readZipEntry(sut, { ...entry, localOffset: 3 })).toThrow(
      'no header where offset 3 points',
    )
  })
})
