import { once } from 'node:events'
import { createWriteStream, type WriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { finished } from 'node:stream/promises'

import type { Row } from '../../core/engine/query.ts'
import type { RowFormatter } from '../../core/results/export-format.ts'

export interface RowSource {
  readonly rowCount: number
  readonly rows: (start: number, count: number) => readonly Row[]
}

export interface ExportJob {
  readonly formatter: RowFormatter
  readonly isCancelled: () => boolean
}

export interface ExportOutcome {
  readonly rows: number
  readonly isCancelled: boolean
}

// Rows are formatted and written this many at a time.
const CHUNK_ROWS = 2000

// A file written a chunk at a time, waiting for the disk when it falls behind. Its error listener
// exists from the start: an unhandled stream error would stop the extension host.
class FileSink {
  readonly #path: string
  readonly #stream: WriteStream
  #failure: Error | undefined

  constructor(path: string) {
    this.#path = path
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the user picked in the save dialog
    this.#stream = createWriteStream(path, { encoding: 'utf8' })
    this.#stream.on('error', (error) => {
      this.#failure ??= error
    })
  }

  // The first error of the stream: what went wrong, rather than what failed after it.
  get failure(): Error | undefined {
    return this.#failure
  }

  async write(text: string): Promise<void> {
    if (!this.#stream.write(text)) {
      await once(this.#stream, 'drain')
    }
  }

  async end(text: string): Promise<void> {
    this.#stream.end(text)
    await finished(this.#stream)
  }

  // A cancelled or failed export leaves no partial file behind.
  async discard(): Promise<void> {
    this.#stream.destroy()
    await finished(this.#stream).catch(() => undefined)

    await rm(this.#path, { force: true })
  }
}

// Streams the rows to the file: the export is never built in memory.
export async function writeExport(
  path: string,
  source: RowSource,
  job: ExportJob,
): Promise<ExportOutcome> {
  const sink = new FileSink(path)
  try {
    await writeRows(sink, source, job)
    if (job.isCancelled()) {
      await sink.discard()
      return { rows: 0, isCancelled: true }
    }
    await sink.end(job.formatter.footer)
    return { rows: source.rowCount, isCancelled: false }
  } catch (error) {
    await sink.discard()
    throw sink.failure ?? error
  }
}

async function writeRows(sink: FileSink, source: RowSource, job: ExportJob): Promise<void> {
  await sink.write(job.formatter.header)
  for (let start = 0; start < source.rowCount && !job.isCancelled(); start += CHUNK_ROWS) {
    const rows = source.rows(start, CHUNK_ROWS)
    await sink.write(rows.map((row, offset) => job.formatter.row(row, start + offset)).join(''))
  }
}
