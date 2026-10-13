// Every statement a user or the grid runs goes through the guards (CLAUDE.md, "Architecture rules"):
// the product calls EngineSession.execute in these modules only, each for its reason. A new call site
// fails this test: route its statements through QueryRunner.perform (a RunWork, then runJob), or add
// it here as one of sqldoro's own statements, which are the only ones that bypass the guards. The
// drivers run some of those themselves, without execute: the catalog queries, the transaction status
// probe, and the strict mode an apply turns on and off (EngineSession.startStrictWrites).
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const PRODUCT = join(ROOT, 'src')
const SOURCE = /\.tsx?$/
const TEST = /\.test\.tsx?$/
const EXECUTE = '.execute('
// sqldoro's own session setting of an apply, which a driver runs itself: never on user SQL.
const SQL_MODE_SWITCH = 'SET SESSION sql_mode'
const SQL_MODE_SITES: readonly string[] = ['src/drivers/mysql/mysql-strict-writes.ts']

const CALL_SITES: ReadonlyMap<string, string> = new Map([
  ['src/drivers/mysql/mysql-query.ts', 'mysql2 runs the statement the driver is asked to run'],
  ['src/extension/editor/run-job.ts', 'statements the guards approved'],
  [
    'src/extension/editor/statement-run.ts',
    'the statement of a job, through the function run-job gives it',
  ],
  [
    'src/extension/edits/edit-batch.ts',
    "the statements of edits the guards approved, and sqldoro's own transaction statements (the driver switches strict mode on and off around them)",
  ],
  ['src/extension/transactions/editor-transactions.ts', "sqldoro's own transaction statements"],
])
// Where statements written by users or by the grid run: each asks the approval of its run first.
const APPROVED: readonly string[] = [
  'src/extension/editor/run-job.ts',
  'src/extension/edits/edit-batch.ts',
]

async function productFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        return productFiles(path)
      }
      return SOURCE.test(entry.name) && !TEST.test(entry.name) ? [path] : []
    }),
  )
  return nested.flat()
}

async function callers(code = EXECUTE): Promise<string[]> {
  const files = await productFiles(PRODUCT)
  const texts = await Promise.all(
    files.map(async (file) => [file, await readFile(file, 'utf8')] as const),
  )
  return texts
    .filter(([, text]) => text.includes(code))
    .map(([file]) => relative(ROOT, file).replaceAll('\\', '/'))
    .toSorted(byName)
}

function byName(left: string, right: string): number {
  return left.localeCompare(right)
}

describe('the paths that run SQL', () => {
  it('should be the known ones only', async () => {
    expect(await callers()).toStrictEqual([...CALL_SITES.keys()].toSorted(byName))
  })

  it('should switch the sql_mode of a session in the MySQL driver only', async () => {
    expect(await callers(SQL_MODE_SWITCH)).toStrictEqual(SQL_MODE_SITES)
  })

  it('should ask the approval of the guards where users and the grid run statements', async () => {
    for (const file of APPROVED) {
      expect(await readFile(join(ROOT, file), 'utf8')).toContain('approval.classOf(')
    }
  })
})
