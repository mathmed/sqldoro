import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import {
  type QueryHarness,
  queryHarness,
  SHOP,
  SHOP_BINDING,
  sqlEditor,
} from '../../../test/support/query.ts'
import { resetVscode, ThemeColor, Uri } from '../../../test/vscode.ts'
import { ConnectionColor, EnvironmentTag } from '../../core/connection/connection.ts'
import { EnvironmentDecorations } from './environment-decorations.ts'

let harness: QueryHarness
let sut: EnvironmentDecorations

async function decorationOf(binding = SHOP_BINDING): Promise<vscode.FileDecoration | undefined> {
  const editor = await sqlEditor(harness, 'SELECT 1', binding)
  return sut.provideFileDecoration(editor.document.uri as unknown as vscode.Uri)
}

beforeEach(() => {
  resetVscode()
  harness = queryHarness()
  sut = new EnvironmentDecorations({
    bindings: harness.bindings,
    connections: (id) => harness.connections.get(id),
    policy: () => ({ productionEnvironments: new Set(['prod', 'staging']) }),
  })
})

describe('EnvironmentDecorations', () => {
  it('should badge and color the editors of tagged connections', async () => {
    harness.connections.set('shop', { ...SHOP, environment: EnvironmentTag.Production })

    expect(await decorationOf()).toMatchObject({
      badge: 'P',
      tooltip: 'Runs on "Shop" (Production)',
      color: new ThemeColor('charts.red'),
      propagate: false,
    })
  })

  it('should color the editors as production for every production environment', async () => {
    harness.connections.set('shop', {
      ...SHOP,
      environment: EnvironmentTag.Staging,
      color: ConnectionColor.Green,
    })

    expect(await decorationOf()).toMatchObject({ badge: 'S', color: new ThemeColor('charts.red') })
  })

  it('should badge the editors of a connection with a color and no environment', async () => {
    harness.connections.set('shop', { ...SHOP, color: ConnectionColor.Purple })

    expect(await decorationOf()).toMatchObject({
      badge: '●',
      tooltip: 'Runs on "Shop"',
      color: new ThemeColor('charts.purple'),
    })
  })

  it('should leave untagged connections, unknown ones and unbound documents alone', async () => {
    expect(await decorationOf()).toBeUndefined()
    expect(await decorationOf({ ...SHOP_BINDING, connectionId: 'gone' })).toBeUndefined()
    expect(
      sut.provideFileDecoration(Uri.parse('untitled:x') as unknown as vscode.Uri),
    ).toBeUndefined()
  })

  it('should tell VS Code when every decoration may have changed', () => {
    const listener = vi.fn()
    sut.onDidChangeFileDecorations(listener)

    sut.refresh()

    expect(listener).toHaveBeenCalledWith(undefined)
    sut.dispose()
  })
})
