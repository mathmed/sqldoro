import { describe, expect, it, vi } from 'vitest'

import { decodeList } from '../json/versioned-list.ts'
import {
  deleteQuery,
  exportQueries,
  folderContents,
  folderPaths,
  freeName,
  importQueries,
  putQuery,
  queryNameProblem,
  SAVED_QUERY_FORMAT,
  type SavedQuery,
} from './saved-queries.ts'

function query(id: string, changes: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id,
    name: `Query ${id}`,
    folder: '',
    sql: `SELECT ${id}`,
    createdAt: '2026-10-10T03:00:00.000Z',
    updatedAt: '2026-10-10T03:00:00.000Z',
    ...changes,
  }
}

const QUERIES = [
  query('a', { name: 'Totals', folder: 'reports/monthly' }),
  query('b', { name: 'by day', folder: 'reports' }),
  query('c', { name: 'Users' }),
  query('d', { name: 'active users' }),
  query('e', { name: 'x', folder: 'admin' }),
]

describe('queryNameProblem', () => {
  it('should require a name', () => {
    expect(queryNameProblem('  ')).toBe('A saved query needs a name')
    expect(queryNameProblem('x')).toBeUndefined()
  })
})

describe('putQuery and deleteQuery', () => {
  it('should add a new query at the end and replace one with the same id in place', () => {
    expect(putQuery([query('a'), query('b')], query('c')).map((saved) => saved.id)).toStrictEqual([
      'a',
      'b',
      'c',
    ])
    expect(putQuery([query('a'), query('b')], query('a', { name: 'New' }))).toStrictEqual([
      query('a', { name: 'New' }),
      query('b'),
    ])
  })

  it('should delete by id', () => {
    expect(deleteQuery([query('a'), query('b')], 'a')).toStrictEqual([query('b')])
  })
})

describe('folderPaths and folderContents', () => {
  it('should list every folder with the ones above it, in order', () => {
    expect(folderPaths(QUERIES)).toStrictEqual(['admin', 'reports', 'reports/monthly'])
    expect(folderPaths([query('x', { folder: 'a/b/c' })])).toStrictEqual(['a', 'a/b', 'a/b/c'])
  })

  it('should list the folders right under a folder and its queries by name', () => {
    expect(folderContents(QUERIES, '')).toStrictEqual({
      folders: ['admin', 'reports'],
      queries: [query('d', { name: 'active users' }), query('c', { name: 'Users' })],
    })
    expect(folderContents(QUERIES, 'reports')).toStrictEqual({
      folders: ['reports/monthly'],
      queries: [query('b', { name: 'by day', folder: 'reports' })],
    })
    expect(folderContents(QUERIES, 'reports/monthly').folders).toStrictEqual([])
  })

  it('should not take a folder that only starts like another for its child', () => {
    expect(
      folderContents([...QUERIES, query('f', { folder: 'reportsx' })], 'reports').folders,
    ).toStrictEqual(['reports/monthly'])
  })
})

describe('freeName', () => {
  it('should number a name taken in the same folder, without case', () => {
    expect(freeName(QUERIES, '', 'users')).toBe('users (2)')
    expect(freeName(QUERIES, 'admin', 'Users')).toBe('Users')
  })
})

describe('exportQueries and importQueries', () => {
  it('should read back what it exported, with new ids and free names', () => {
    const text = exportQueries([
      query('a', { name: 'Users' }),
      query('b', { name: 'Users', folder: 'x' }),
    ])
    const createId = vi.fn().mockReturnValueOnce('new-1').mockReturnValueOnce('new-2')

    const sut = importQueries(text, [query('c', { name: 'users' })], createId)

    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toMatchObject({ kind: 'sqldoro.savedQueries', version: 1 })
    expect(sut).toStrictEqual({
      queries: [
        query('c', { name: 'users' }),
        query('a', { id: 'new-1', name: 'Users (2)' }),
        query('b', { id: 'new-2', name: 'Users', folder: 'x' }),
      ],
      added: 2,
      problems: [],
    })
  })

  it('should give a second imported query with the same name a number too', () => {
    const text = exportQueries([query('a', { name: 'Same' }), query('b', { name: 'Same' })])

    const sut = importQueries(text, [], () => 'id')

    expect(sut.queries.map((saved) => saved.name)).toStrictEqual(['Same', 'Same (2)'])
  })

  it('should name the saved queries when the whole list cannot be read', () => {
    expect(decodeList({ version: 1, queries: 'none' }, SAVED_QUERY_FORMAT).problems).toStrictEqual([
      'The saved queries cannot be read: "queries" must be a list',
    ])
  })

  it('should report the entries it cannot read and import the others', () => {
    const text = JSON.stringify({
      kind: 'sqldoro.savedQueries',
      version: 1,
      queries: [query('a'), { id: 1 }],
    })

    expect(importQueries(text, [], () => 'id')).toMatchObject({
      added: 1,
      problems: ['Saved query #2 cannot be read: "id" must be a string'],
    })
  })

  it.each([
    ['{', /^The file is not JSON: /],
    ['[]', /^The file does not hold queries saved by sqldoro$/],
    ['null', /^The file does not hold queries saved by sqldoro$/],
    ['{"kind": "other"}', /^The file does not hold queries saved by sqldoro$/],
    ['{"version": 1, "queries": []}', /^The file does not hold queries saved by sqldoro$/],
  ])('should refuse %s and keep the saved queries', (text, problem) => {
    const existing = [query('a')]

    const sut = importQueries(text, existing, () => 'id')

    expect(sut.queries).toBe(existing)
    expect(sut.added).toBe(0)
    expect(sut.problems).toHaveLength(1)
    expect(sut.problems[0]).toMatch(problem)
  })

  it('should rethrow what is not a JSON syntax error', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new RangeError('too deep')
    })

    expect(() => importQueries('{}', [], () => 'id')).toThrow(RangeError)
  })
})

describe('SAVED_QUERY_FORMAT', () => {
  it('should read the folder normalized', () => {
    expect(
      decodeList({ version: 1, queries: [query('a', { folder: ' a/ b ' })] }, SAVED_QUERY_FORMAT)
        .items,
    ).toStrictEqual([query('a', { folder: 'a/b' })])
  })
})
