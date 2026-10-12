import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import {
  changedScopes,
  type SelectableConnection,
  type SelectedScope,
  selectedScopes,
  SelectionSource,
  showsScope,
} from './selection.ts'

const SHOP: SelectableConnection = { id: 'shop', database: 'shop', dialect: POSTGRES_DIALECT }
const LOCAL: SelectableConnection = { id: 'local', database: 'app', dialect: MYSQL_DIALECT }
const SERVER: SelectableConnection = { id: 'server', database: '', dialect: MYSQL_DIALECT }

function scope(overrides: Partial<SelectedScope> = {}): SelectedScope {
  return {
    connectionId: 'shop',
    database: 'shop',
    schema: 'public',
    source: SelectionSource.Editor,
    ...overrides,
  }
}

describe('selectedScopes', () => {
  it('should mark the default database of each connection without an editor in front', () => {
    const sut = selectedScopes([SHOP, LOCAL, SERVER], undefined)

    expect([...sut]).toStrictEqual([
      ['shop', scope({ source: SelectionSource.Default })],
      [
        'local',
        {
          connectionId: 'local',
          database: 'app',
          schema: 'app',
          source: SelectionSource.Default,
        },
      ],
    ])
  })

  it('should mark only where the editor in front runs', () => {
    const sut = selectedScopes([SHOP, LOCAL], {
      connectionId: 'shop',
      database: 'stock',
      schema: 'sales',
    })

    expect([...sut]).toStrictEqual([['shop', scope({ database: 'stock', schema: 'sales' })]])
  })

  it('should run an editor without a database or schema on the defaults of its connection', () => {
    expect(
      selectedScopes([SHOP], { connectionId: 'shop', database: '', schema: '' }).get('shop'),
    ).toStrictEqual(scope())
    expect(
      selectedScopes([LOCAL], { connectionId: 'local', database: '', schema: '' }).get('local'),
    ).toStrictEqual({
      connectionId: 'local',
      database: 'app',
      schema: 'app',
      source: SelectionSource.Editor,
    })
  })

  it('should mark nothing for an editor on a connection without a database of its own', () => {
    expect(
      selectedScopes([SERVER, SHOP], { connectionId: 'server', database: '', schema: '' }).size,
    ).toBe(0)
  })

  it('should fall back to the defaults for an editor on a connection that is gone', () => {
    const sut = selectedScopes([SHOP], { connectionId: 'gone', database: 'x', schema: '' })

    expect(sut.get('shop')).toStrictEqual(scope({ source: SelectionSource.Default }))
  })
})

describe('changedScopes', () => {
  it('should give nothing when no mark changes', () => {
    const marks = new Map([['shop', scope()]])

    expect(changedScopes(marks, new Map([['shop', scope()]]))).toStrictEqual([])
    expect(changedScopes(new Map(), new Map())).toStrictEqual([])
  })

  it('should give the old and the new mark of a connection whose mark moved', () => {
    const before = new Map([['shop', scope()]])

    expect(changedScopes(before, new Map([['shop', scope({ database: 'stock' })]]))).toStrictEqual([
      scope(),
      scope({ database: 'stock' }),
    ])
    expect(changedScopes(before, new Map([['shop', scope({ schema: 'sales' })]]))).toStrictEqual([
      scope(),
      scope({ schema: 'sales' }),
    ])
    expect(
      changedScopes(before, new Map([['shop', scope({ source: SelectionSource.Default })]])),
    ).toStrictEqual([scope(), scope({ source: SelectionSource.Default })])
  })

  it('should give the marks that appear and those that go', () => {
    const local = scope({ connectionId: 'local', database: 'app', schema: 'app' })

    expect(changedScopes(new Map([['shop', scope()]]), new Map([['local', local]]))).toStrictEqual([
      scope(),
      local,
    ])
  })
})

describe('showsScope', () => {
  it('should mark the database that holds the scope', () => {
    expect(showsScope({ database: 'shop', schema: '', isSchema: false }, scope())).toBe(true)
    expect(showsScope({ database: 'stock', schema: '', isSchema: false }, scope())).toBe(false)
  })

  it('should mark the schema that is the scope', () => {
    expect(showsScope({ database: 'shop', schema: 'public', isSchema: true }, scope())).toBe(true)
    expect(showsScope({ database: 'shop', schema: 'sales', isSchema: true }, scope())).toBe(false)
    expect(showsScope({ database: 'stock', schema: 'public', isSchema: true }, scope())).toBe(false)
  })
})
