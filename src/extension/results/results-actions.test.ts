import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { RESULT_COLUMNS } from '../../../test/fixtures/results.ts'
import { env, resetVscode, Uri, window } from '../../../test/vscode.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { copyRows, exportRows } from './results-actions.ts'

function result(sql = 'SELECT id, name FROM sales.orders', count = 2): ResultSet {
  const sut = new ResultSet({ id: 't', sql, kind: 'rows', canServerView: true, canRefresh: false })
  sut.describe(RESULT_COLUMNS)
  sut.addRows(
    Array.from({ length: count }, (...[, index]) => [
      String(index + 1),
      index === 0 ? "it's" : null,
    ]),
  )
  return sut
}

beforeEach(() => {
  resetVscode()
  for (const mock of [
    window.showWarningMessage,
    window.showErrorMessage,
    window.showInformationMessage,
    window.showSaveDialog,
    env.clipboard.writeText,
  ]) {
    mock.mockReset()
  }
})

describe('copyRows', () => {
  it('should copy the selected cells in the format asked and say how many rows', async () => {
    await copyRows(
      result(),
      { range: { firstRow: 0, lastRow: 1, firstColumn: 0, lastColumn: 1 }, format: 'tsv' },
      POSTGRES_DIALECT,
    )

    expect(env.clipboard.writeText).toHaveBeenCalledWith("1\tit's\r\n2\t\r\n")
    expect(window.setStatusBarMessage).toHaveBeenCalledWith('Copied 2 rows as TSV', 4000)
  })

  it('should write INSERT statements to the table the query read', async () => {
    await copyRows(
      result(),
      { range: { firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 1 }, format: 'sql' },
      POSTGRES_DIALECT,
    )

    expect(env.clipboard.writeText).toHaveBeenCalledWith(
      `INSERT INTO "sales"."orders" ("id", "name") VALUES (1, 'it''s');\n`,
    )
    expect(window.setStatusBarMessage).toHaveBeenCalledWith(
      'Copied 1 row as SQL INSERT statements',
      4000,
    )
  })

  it('should name the table when the query reads none or several', async () => {
    await copyRows(
      result('SELECT 1 AS id, 2 AS name'),
      { range: { firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 0 }, format: 'sql' },
      MYSQL_DIALECT,
    )

    expect(env.clipboard.writeText).toHaveBeenCalledWith(
      'INSERT INTO `table_name` (`id`) VALUES (1);\n',
    )
  })

  it('should send large selections to a file instead of the clipboard', async () => {
    await copyRows(
      result(),
      { range: { firstRow: 0, lastRow: 100_000, firstColumn: 0, lastColumn: 0 }, format: 'csv' },
      POSTGRES_DIALECT,
    )

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Copy at most 100,000 rows at a time: export larger results to a file.',
    )
    expect(env.clipboard.writeText).not.toHaveBeenCalled()
  })
})

describe('exportRows', () => {
  it('should stream the rows of the view to the file the user picks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sqldoro-actions-'))
    const path = join(directory, 'orders.json')
    window.showSaveDialog.mockResolvedValueOnce(Uri.file(path))
    const rows = result()
    rows.applyView({ sort: [{ column: 0, isDescending: true }], filters: [] })

    await exportRows(rows, 'json', POSTGRES_DIALECT)

    expect(window.showSaveDialog).toHaveBeenCalledWith({
      title: 'Export Result',
      saveLabel: 'Export',
      filters: { JSON: ['json'] },
    })
    expect(JSON.parse(await readFile(path, 'utf8'))).toStrictEqual([
      { id: 2, name: null },
      { id: 1, name: "it's" },
    ])
    expect(window.showInformationMessage).toHaveBeenCalledWith(`Exported 2 rows to ${path}`)
  })

  it('should do nothing when the dialog is dismissed', async () => {
    await exportRows(result(), 'csv', POSTGRES_DIALECT)

    expect(window.showInformationMessage).not.toHaveBeenCalled()
  })

  it('should only write to a file on this machine', async () => {
    window.showSaveDialog.mockResolvedValueOnce(Uri.parse('vscode-remote:/home/x.csv'))

    await exportRows(result(), 'csv', POSTGRES_DIALECT)

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'A result can only be exported to a file on this machine.',
    )
  })

  it('should say nothing about an export the user cancels', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sqldoro-actions-'))
    window.showSaveDialog.mockResolvedValueOnce(Uri.file(join(directory, 'x.csv')))
    vi.spyOn(window, 'withProgress').mockImplementationOnce(async (...[, task]) =>
      task({ report: vi.fn() }, { isCancellationRequested: true }),
    )

    await exportRows(result(), 'csv', POSTGRES_DIALECT)

    expect(window.showInformationMessage).not.toHaveBeenCalled()
  })

  it('should export through a progress notification that can be cancelled', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sqldoro-actions-'))
    window.showSaveDialog.mockResolvedValueOnce(Uri.file(join(directory, 'x.sql')))
    const progress = vi.spyOn(window, 'withProgress')

    await exportRows(result(), 'sql', POSTGRES_DIALECT)

    expect(progress.mock.calls[0]?.[0]).toStrictEqual({
      location: 15,
      title: 'Exporting the result',
      cancellable: true,
    })
  })
})
