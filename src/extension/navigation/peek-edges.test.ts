import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type NavigationHarness,
  navigationHarness,
  NOTE_COLUMN,
  postedOf,
} from '../../../test/support/navigation.ts'
import { resetVscode, webviewPanels } from '../../../test/vscode.ts'
import type { QueryRequest } from '../../core/engine/query.ts'

let nav: NavigationHarness

beforeEach(() => {
  resetVscode()
  webviewPanels.length = 0
})

afterEach(() => {
  nav.harness.dispose()
})

async function peekOf(row: number, column = NOTE_COLUMN): Promise<unknown> {
  const count = postedOf(nav.orders.panel, 'peek').length
  nav.send({ type: 'peek', row, column })
  return vi.waitFor(() => {
    const posted = postedOf(nav.orders.panel, 'peek')
    expect(posted).toHaveLength(count + 1)
    return posted.at(-1)?.['peek']
  })
}

function notes(answer: (request: QueryRequest) => object | undefined): {
  readonly answers: (request: QueryRequest) => object | undefined
} {
  return { answers: (request) => (request.sql.includes('"notes"') ? answer(request) : undefined) }
}

describe('peeking, at the edges', () => {
  it('should say that a cell that is no link points at no row', async () => {
    nav = await navigationHarness()

    await expect(peekOf(1, 0)).resolves.toMatchObject({
      problem: 'This cell points at no row: it is NULL.',
    })
  })

  it('should say that the row is not there any more', async () => {
    nav = await navigationHarness(notes(() => ({ columns: [], rows: [] })))

    await expect(peekOf(1)).resolves.toStrictEqual({
      title: 'notes #gift',
      columns: [],
      values: [],
      problem: 'The row this cell points at is not there (any more).',
    })
  })

  it('should give the message of the server when the read fails', async () => {
    nav = await navigationHarness(notes(() => ({ error: new Error('permission denied') })))

    await expect(peekOf(1)).resolves.toMatchObject({
      title: 'notes #gift',
      problem: 'permission denied',
    })
  })

  it('should not read while the panel runs something else', async () => {
    nav = await navigationHarness({
      answers: (request) => (request.sql.includes('COUNT(*)') ? { isPending: true } : undefined),
    })
    nav.send({ type: 'countReferences', row: 0 })
    await vi.waitFor(() => {
      expect(nav.harness.runner.isRunning(nav.orders.uri)).toBe(true)
    })

    await expect(peekOf(1)).resolves.toMatchObject({
      title: 'notes #gift',
      problem: 'Rows are being read in this panel: try again once they are here.',
    })
  })

  it('should say that it did not read a row it could not', async () => {
    nav = await navigationHarness()
    nav.harness.connections.delete('shop')

    await expect(peekOf(1)).resolves.toMatchObject({
      problem: 'sqldoro did not read the row.',
    })
  })
})

describe('counting the rows that reference a row, at the edges', () => {
  it('should count nothing for a row the view does not have, or rows nothing references', async () => {
    nav = await navigationHarness({ references: [] })
    const before = nav.sent().length

    nav.send({ type: 'countReferences', row: 0 })
    nav.send({ type: 'countReferences', row: 9 })
    await Promise.resolve()

    expect(nav.sent()).toHaveLength(before)
    expect(postedOf(nav.orders.panel, 'referenceCounts')).toStrictEqual([])
  })

  it('should leave a count that failed out, and say why in the log', async () => {
    nav = await navigationHarness({
      answers: (request) =>
        request.sql.includes('COUNT(*)') ? { error: new Error('timeout') } : undefined,
    })

    nav.send({ type: 'countReferences', row: 0 })

    await vi.waitFor(() => {
      expect(postedOf(nav.orders.panel, 'referenceCounts').at(-1)).toMatchObject({
        counts: [null],
      })
    })
    expect(nav.harness.log.warn).toHaveBeenCalledWith(
      'Could not count the rows that reference a row: timeout',
    )
  })

  it('should leave a count of no row as no count', async () => {
    nav = await navigationHarness({
      answers: (request) =>
        request.sql.includes('COUNT(*)') ? { columns: [], rows: [] } : undefined,
    })

    nav.send({ type: 'countReferences', row: 0 })

    await vi.waitFor(() => {
      expect(postedOf(nav.orders.panel, 'referenceCounts').at(-1)).toMatchObject({
        counts: [null],
      })
    })
  })

  it('should post nothing when the counts could not run', async () => {
    nav = await navigationHarness()
    nav.harness.connections.delete('shop')

    nav.send({ type: 'countReferences', row: 0 })
    await vi.waitFor(() => {
      expect(nav.harness.runner.isRunning(nav.orders.uri)).toBe(false)
    })

    expect(postedOf(nav.orders.panel, 'referenceCounts')).toStrictEqual([])
  })
})
