import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { RESULT_COLUMNS } from '../../../test/fixtures/results.ts'
import type { Row } from '../../core/engine/query.ts'
import { ExportFormat, rowFormatter } from '../../core/results/export-format.ts'
import { writeExport } from './export-file.ts'

const FORMATTER = rowFormatter(ExportFormat.Csv, {
  columns: RESULT_COLUMNS,
  table: ['t'],
  dialect: POSTGRES_DIALECT,
})

function source(count: number): {
  readonly rowCount: number
  readonly rows: (start: number, size: number) => Row[]
} {
  return {
    rowCount: count,
    rows: (start, size) =>
      Array.from({ length: Math.min(size, count - start) }, (...[, offset]) => [
        String(start + offset),
        'x'.repeat(100),
      ]),
  }
}

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'sqldoro-export-'))
})

describe('writeExport', () => {
  it('should stream every row to the file a chunk at a time', async () => {
    const path = join(directory, 'rows.csv')

    const outcome = await writeExport(path, source(5000), {
      formatter: FORMATTER,
      isCancelled: () => false,
    })

    const lines = (await readFile(path, 'utf8')).split('\r\n')
    expect(outcome).toStrictEqual({ rows: 5000, isCancelled: false })
    expect(lines).toHaveLength(5002)
    expect(lines[0]).toBe('id,name')
    expect(lines[4999]).toBe(`4998,${'x'.repeat(100)}`)
  })

  it('should leave no file behind when it is cancelled', async () => {
    const path = join(directory, 'cancelled.csv')
    let checks = 0

    const outcome = await writeExport(path, source(10_000), {
      formatter: FORMATTER,
      isCancelled: () => {
        checks += 1
        return checks > 2
      },
    })

    expect(outcome).toStrictEqual({ rows: 0, isCancelled: true })
    expect(existsSync(path)).toBe(false)
  })

  it('should report a file it cannot write and leave nothing behind', async () => {
    const path = join(directory, 'missing', 'rows.csv')

    await expect(
      writeExport(path, source(10), { formatter: FORMATTER, isCancelled: () => false }),
    ).rejects.toThrow(/ENOENT/)
    expect(existsSync(path)).toBe(false)
  })

  it('should report what fails while formatting and leave nothing behind', async () => {
    const path = join(directory, 'broken.csv')
    const formatter = {
      ...FORMATTER,
      row: () => {
        throw new RangeError('Invalid string length')
      },
    }

    await expect(
      writeExport(path, source(10), { formatter, isCancelled: () => false }),
    ).rejects.toThrow(new RangeError('Invalid string length'))
    expect(existsSync(path)).toBe(false)
  })
})
