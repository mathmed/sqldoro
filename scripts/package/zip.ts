import { inflateRawSync } from 'node:zlib'

// Just enough of the ZIP format to list a .vsix and read a file of it, with Node.js built-ins only.
// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT (sections 4.3.7, 4.3.12, 4.3.16)
const END_RECORD_SIGNATURE = 0x06054b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const LOCAL_HEADER_SIGNATURE = 0x04034b50
const END_RECORD_SIZE = 22
const MAX_COMMENT_LENGTH = 0xffff
// A field ZIP64 moved elsewhere holds all ones: such archives are far beyond the size of a .vsix.
const ZIP64_COUNT = 0xffff
const ZIP64_OFFSET = 0xffffffff
const END_RECORD = { entryCount: 10, directoryOffset: 16 } as const
const CENTRAL_HEADER = {
  method: 10,
  compressedSize: 20,
  size: 24,
  nameLength: 28,
  extraLength: 30,
  commentLength: 32,
  localOffset: 42,
  name: 46,
} as const
const LOCAL_HEADER = { nameLength: 26, extraLength: 28, name: 30 } as const

export const CompressionMethod = {
  Stored: 0,
  Deflated: 8,
} as const

export interface ZipEntry {
  readonly name: string
  readonly size: number
  readonly compressedSize: number
  readonly method: number
  readonly localOffset: number
}

// The entries of the archive, in the order of its central directory.
export function readZipEntries(archive: Buffer): ZipEntry[] {
  const end = findEndRecord(archive)
  const count = archive.readUInt16LE(end + END_RECORD.entryCount)
  const start = archive.readUInt32LE(end + END_RECORD.directoryOffset)
  if (count === ZIP64_COUNT || start === ZIP64_OFFSET) {
    throw new Error('ZIP64 archives are not supported')
  }
  const entries: ZipEntry[] = []
  let position = start
  for (let index = 0; index < count; index += 1) {
    const { entry, next } = readCentralHeader(archive, position)
    entries.push(entry)
    position = next
  }
  return entries
}

// The contents of one entry, inflated.
export function readZipEntry(archive: Buffer, entry: ZipEntry): Buffer {
  expectSignature(archive, entry.localOffset, LOCAL_HEADER_SIGNATURE)
  const nameLength = archive.readUInt16LE(entry.localOffset + LOCAL_HEADER.nameLength)
  const extraLength = archive.readUInt16LE(entry.localOffset + LOCAL_HEADER.extraLength)
  const start = entry.localOffset + LOCAL_HEADER.name + nameLength + extraLength
  const data = archive.subarray(start, start + entry.compressedSize)
  switch (entry.method) {
    case CompressionMethod.Stored:
      return data
    case CompressionMethod.Deflated:
      return inflateRawSync(data)
    default:
      throw new Error(`${entry.name}: compression method ${String(entry.method)} is not supported`)
  }
}

// The end record closes the archive, followed only by a comment of up to 64 KiB.
function findEndRecord(archive: Buffer): number {
  const lowest = Math.max(archive.length - END_RECORD_SIZE - MAX_COMMENT_LENGTH, 0)
  for (let position = archive.length - END_RECORD_SIZE; position >= lowest; position -= 1) {
    if (archive.readUInt32LE(position) === END_RECORD_SIGNATURE) {
      return position
    }
  }
  throw new Error('not a ZIP archive: it has no end of central directory record')
}

function readCentralHeader(
  archive: Buffer,
  position: number,
): { readonly entry: ZipEntry; readonly next: number } {
  expectSignature(archive, position, CENTRAL_HEADER_SIGNATURE)
  const field = (offset: number): number => archive.readUInt16LE(position + offset)
  const long = (offset: number): number => archive.readUInt32LE(position + offset)
  const nameStart = position + CENTRAL_HEADER.name
  const nameEnd = nameStart + field(CENTRAL_HEADER.nameLength)
  const entry = {
    name: archive.toString('utf8', nameStart, nameEnd),
    size: long(CENTRAL_HEADER.size),
    compressedSize: long(CENTRAL_HEADER.compressedSize),
    method: field(CENTRAL_HEADER.method),
    localOffset: long(CENTRAL_HEADER.localOffset),
  }
  const next = nameEnd + field(CENTRAL_HEADER.extraLength) + field(CENTRAL_HEADER.commentLength)
  return { entry, next }
}

function expectSignature(archive: Buffer, position: number, signature: number): void {
  if (position + Uint32Array.BYTES_PER_ELEMENT > archive.length) {
    throw new Error(`not a ZIP archive: offset ${String(position)} is past its end`)
  }
  if (archive.readUInt32LE(position) !== signature) {
    throw new Error(`not a ZIP archive: no header where offset ${String(position)} points`)
  }
}
