// Writes small ZIP archives for the tests of the .vsix checks: stored or deflated entries, the
// central directory and its end record, as vsce (yazl) writes them.
import { crc32, deflateRawSync } from 'node:zlib'

export interface ZipFile {
  readonly name: string
  readonly content: string | Buffer
  readonly isStored?: boolean
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_RECORD = 0x06054b50
const VERSION = 20
const STORED = 0
const DEFLATED = 8

interface Written {
  readonly local: Buffer
  readonly central: (offset: number) => Buffer
}

function writeEntry(file: ZipFile): Written {
  const name = Buffer.from(file.name, 'utf8')
  const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
  const isStored = file.isStored ?? false
  const body = isStored ? data : deflateRawSync(data)
  const method = isStored ? STORED : DEFLATED
  const local = Buffer.alloc(30)
  local.writeUInt32LE(LOCAL_HEADER, 0)
  local.writeUInt16LE(VERSION, 4)
  local.writeUInt16LE(method, 8)
  local.writeUInt32LE(crc32(data), 14)
  local.writeUInt32LE(body.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  const central = (offset: number): Buffer => {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(CENTRAL_HEADER, 0)
    header.writeUInt16LE(VERSION, 4)
    header.writeUInt16LE(VERSION, 6)
    header.writeUInt16LE(method, 10)
    header.writeUInt32LE(crc32(data), 16)
    header.writeUInt32LE(body.length, 20)
    header.writeUInt32LE(data.length, 24)
    header.writeUInt16LE(name.length, 28)
    header.writeUInt32LE(offset, 42)
    return Buffer.concat([header, name])
  }
  return { local: Buffer.concat([local, name, body]), central }
}

export function zipArchive(files: readonly ZipFile[], comment = ''): Buffer {
  const parts: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const written = writeEntry(file)
    centrals.push(written.central(offset))
    parts.push(written.local)
    offset += written.local.length
  }
  const directory = Buffer.concat(centrals)
  const commentBytes = Buffer.from(comment, 'utf8')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_RECORD, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(commentBytes.length, 20)
  return Buffer.concat([...parts, directory, end, commentBytes])
}
