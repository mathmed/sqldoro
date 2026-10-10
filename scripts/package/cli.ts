import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'

import { readBytes, readText } from '../shared/files.ts'
import { field, parseObject, STRING } from '../shared/json.ts'
import { formatBytes } from '../shared/text.ts'
import { vsixProblems } from './vsix-rules.ts'
import { readZipEntries, readZipEntry, type ZipEntry } from './zip.ts'

export interface PackageContext {
  // Writes the .vsix (vsce), its files dated at `sourceDateEpoch` (seconds since the epoch).
  readonly pack: (packagePath: string, sourceDateEpoch: string) => Promise<void>
  readonly lastCommitTime: () => Promise<number>
  readonly environment: NodeJS.ProcessEnv
  readonly root: string
}

const MANIFEST_ENTRY = 'extension/package.json'
// Lines the package analyzer of the Quality Report reads.
const REPORT = '>> package'

// Packs the extension into <name>-<version>.vsix and checks what the package holds: 0 when it holds
// what it should, 1 otherwise.
export async function main(context: PackageContext): Promise<number> {
  const manifest = parseObject(JSON.parse(await readText(join(context.root, 'package.json'))))
  const name = `${field(manifest, 'name', STRING)}-${field(manifest, 'version', STRING)}.vsix`
  const packagePath = join(context.root, name)
  const sourceDateEpoch =
    context.environment['SOURCE_DATE_EPOCH'] ?? String(await context.lastCommitTime())
  await context.pack(packagePath, sourceDateEpoch)
  const archive = await readBytes(packagePath)
  const entries = readZipEntries(archive)
  const problems = vsixProblems({
    names: entries.map((entry) => entry.name),
    manifest: packagedManifest(archive, entries),
    bytes: archive.length,
  })
  console.log(report(packagePath, archive, entries).join('\n'))
  for (const problem of problems) {
    console.log(`${REPORT} problem: ${problem}`)
  }
  return problems.length === 0 ? 0 : 1
}

// The package.json the package holds, parsed; undefined when it holds none (a problem of its own).
function packagedManifest(archive: Buffer, entries: readonly ZipEntry[]): unknown {
  const entry = entries.find((candidate) => candidate.name === MANIFEST_ENTRY)
  return entry === undefined ? undefined : JSON.parse(readZipEntry(archive, entry).toString('utf8'))
}

function report(packagePath: string, archive: Buffer, entries: readonly ZipEntry[]): string[] {
  const hash = createHash('sha256').update(archive).digest('hex')
  const size = formatBytes(archive.length)
  return [
    `${REPORT} ${basename(packagePath)}: ${size}, ${String(entries.length)} files, sha256 ${hash}`,
    ...entries.map((entry) => `${REPORT} file ${entry.name} ${formatBytes(entry.size)}`),
  ]
}
