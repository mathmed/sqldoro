import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { MYSQL, POSTGRES, SHOP } from '../../../test/support/explorer.ts'
import { ThemeColor, Uri } from '../../../test/vscode.ts'
import {
  ConnectionColor,
  type ConnectionConfig,
  EnvironmentTag,
  newConnection,
} from '../../core/connection/connection.ts'
import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { DatabaseSelection } from './database-selection.ts'
import { ExplorerDecorations } from './explorer-decorations.ts'
import { connectionUri, databaseUri, schemaUri } from './node-uris.ts'

const LOCAL: ConnectionConfig = {
  ...newConnection('local', MYSQL),
  name: 'Local',
  database: 'app',
  environment: EnvironmentTag.None,
}

let connections: ConnectionConfig[]
let selection: DatabaseSelection
let sut: ExplorerDecorations

function decorationOf(uri: unknown): vscode.FileDecoration | undefined {
  return sut.provideFileDecoration(uri as vscode.Uri)
}

beforeEach(() => {
  connections = [SHOP, LOCAL]
  selection = new DatabaseSelection({
    connections: () => connections,
    engines: new EngineRegistry([POSTGRES, MYSQL]),
  })
  sut = new ExplorerDecorations({
    connections: () => connections,
    selection,
    policy: () => ({ productionEnvironments: new Set(['prod']) }),
  })
})

describe('ExplorerDecorations', () => {
  it('should color the label of a connection as its color says, production in red', () => {
    connections = [SHOP, { ...LOCAL, color: ConnectionColor.Purple }]

    expect(decorationOf(connectionUri('shop'))).toMatchObject({
      badge: undefined,
      color: new ThemeColor('charts.red'),
      propagate: false,
    })
    expect(decorationOf(connectionUri('local'))).toMatchObject({
      color: new ThemeColor('charts.purple'),
    })
  })

  it('should leave a connection without a color or environment, and unknown URIs, alone', () => {
    expect(decorationOf(connectionUri('local'))).toBeUndefined()
    expect(decorationOf(connectionUri('gone'))).toBeUndefined()
    expect(decorationOf(databaseUri('local', 'app'))).toBeUndefined()
    expect(decorationOf(Uri.file('/connection/shop'))).toBeUndefined()
  })

  it('should badge the database and schema the SQL editor in front runs on in the accent', () => {
    selection.follow({ connectionId: 'shop', database: 'shop', schema: 'sales' })

    const marked = {
      badge: '●',
      tooltip: 'The SQL editor in front runs here',
      color: new ThemeColor('charts.green'),
      propagate: false,
    }
    expect(decorationOf(databaseUri('shop', 'shop'))).toMatchObject(marked)
    expect(decorationOf(schemaUri('shop', 'shop', 'sales'))).toMatchObject(marked)
    expect(decorationOf(schemaUri('shop', 'shop', 'public'))).toBeUndefined()
    expect(decorationOf(databaseUri('local', 'app'))).toBeUndefined()
  })

  it('should color the default databases without a badge when no SQL editor is in front', () => {
    selection.follow(undefined)

    expect(decorationOf(databaseUri('local', 'app'))).toMatchObject({
      badge: undefined,
      tooltip: 'New queries on this connection run here',
      color: new ThemeColor('charts.green'),
    })
  })

  it('should tell VS Code which labels a move of the mark changes, and when everything may have', () => {
    const listener = vi.fn()
    sut.onDidChangeFileDecorations(listener)
    selection.follow(undefined)
    listener.mockClear()

    selection.follow({ connectionId: 'local', database: 'stock', schema: '' })
    sut.refresh()

    expect(listener.mock.calls).toStrictEqual([
      [
        [
          databaseUri('shop', 'shop'),
          schemaUri('shop', 'shop', 'public'),
          databaseUri('local', 'app'),
          schemaUri('local', 'app', 'app'),
          databaseUri('local', 'stock'),
          schemaUri('local', 'stock', 'stock'),
        ],
      ],
      [undefined],
    ])
  })

  it('should stop following the mark once disposed', () => {
    const listener = vi.fn()
    sut.onDidChangeFileDecorations(listener)

    sut.dispose()
    selection.follow(undefined)

    expect(listener).not.toHaveBeenCalled()
  })

  it('should keep the parts of names that look like paths apart', () => {
    connections = [{ ...LOCAL, database: 'a/b' }]
    selection.follow(undefined)

    expect(databaseUri('local', 'a/b').path).toBe('/database/local/a%2Fb')
    expect(decorationOf(databaseUri('local', 'a/b'))).toBeDefined()
    expect(decorationOf(schemaUri('local', 'a', 'b'))).toBeUndefined()
  })
})
