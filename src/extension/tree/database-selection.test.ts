import { describe, expect, it, vi } from 'vitest'

import { MYSQL, SHOP } from '../../../test/support/explorer.ts'
import { newConnection } from '../../core/connection/connection.ts'
import { SelectionSource } from '../../core/editor/selection.ts'
import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { DatabaseSelection } from './database-selection.ts'

const LOCAL = { ...newConnection('local', MYSQL), name: 'Local', database: 'app' }

function selection(connections = [SHOP, LOCAL]): DatabaseSelection {
  return new DatabaseSelection({
    connections: () => connections,
    engines: new EngineRegistry([MYSQL]),
  })
}

describe('DatabaseSelection', () => {
  it('should mark nothing until it follows an editor', () => {
    const sut = selection()

    expect(sut.selected('local')).toBeUndefined()
  })

  it('should mark the default databases without an editor in front, skipping unknown engines', () => {
    const sut = selection()

    sut.follow(undefined)

    expect(sut.selected('local')).toStrictEqual({
      connectionId: 'local',
      database: 'app',
      schema: 'app',
      source: SelectionSource.Default,
    })
    expect(sut.selected('shop')).toBeUndefined()
  })

  it('should tell the marks that changed, and only when some did', () => {
    const sut = selection()
    const listener = vi.fn()
    sut.onDidChange(listener)
    sut.follow(undefined)
    listener.mockClear()

    sut.follow(undefined)
    expect(listener).not.toHaveBeenCalled()

    sut.follow({ connectionId: 'local', database: 'stock', schema: '' })
    expect(listener).toHaveBeenCalledExactlyOnceWith([
      { connectionId: 'local', database: 'app', schema: 'app', source: SelectionSource.Default },
      { connectionId: 'local', database: 'stock', schema: 'stock', source: SelectionSource.Editor },
    ])
  })

  it('should stop telling once disposed', () => {
    const sut = selection()
    const listener = vi.fn()
    sut.onDidChange(listener)

    sut.dispose()
    sut.follow(undefined)

    expect(listener).not.toHaveBeenCalled()
  })
})
