import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  childrenOf,
  explorer,
  itemOf,
  labelsOf,
  MYSQL,
  open,
  SHOP,
} from '../../../test/support/explorer.ts'
import { EnvironmentTag, newConnection } from '../../core/connection/connection.ts'
import { isFolderNode } from './explorer-node.ts'
import { connectionUri } from './node-uris.ts'

const ACME = {
  ...newConnection('acme', MYSQL),
  name: 'Acme',
  folder: 'clients/acme',
  color: 'blue',
  environment: EnvironmentTag.None,
} as const
const BETA = { ...ACME, id: 'beta', name: 'Beta', folder: 'clients', color: '' } as const

describe('the folders of the Connections view', () => {
  it('should show the folders first, open, then the connections outside them', async () => {
    const { sut } = explorer([SHOP, ACME, BETA])

    const roots = await childrenOf(sut)

    expect(labelsOf(sut, roots)).toStrictEqual(['clients', 'Shop'])
    expect(itemOf(sut, roots, 'clients')).toMatchObject({
      contextValue: 'folder',
      tooltip: 'clients',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      iconPath: new vscode.ThemeIcon(
        'folder',
        new vscode.ThemeColor('symbolIcon.folderForeground'),
      ),
    })
    expect(isFolderNode(roots[0])).toBe(true)
    expect(isFolderNode(roots[1])).toBe(false)
    expect(isFolderNode('clients')).toBe(false)
  })

  it('should nest folders, each with its connections', async () => {
    const { sut } = explorer([SHOP, ACME, BETA])

    expect(labelsOf(sut, await open(sut, 'clients'))).toStrictEqual(['acme', 'Beta'])
    expect(labelsOf(sut, await open(sut, 'clients', 'acme'))).toStrictEqual(['Acme'])
  })

  it('should color the label of a connection through its URI, and say its folder and color in its tooltip', async () => {
    const { sut } = explorer([ACME])

    const acme = itemOf(sut, await open(sut, 'clients', 'acme'), 'Acme')

    expect(acme.resourceUri).toStrictEqual(connectionUri('acme'))
    expect(acme.tooltip).toEqual(expect.stringContaining('Folder: clients/acme\nColor: Blue'))
  })
})

describe('the lists that take a while', () => {
  it('should say what loads, then show the list once it is here', async () => {
    const { promise, resolve } = Promise.withResolvers<{ name: string }[]>()
    const { sut, sessions } = explorer([SHOP], {
      session: { listDatabases: async () => promise },
      delay: async () => Promise.resolve(),
    })
    await sessions.connect(SHOP)
    const changed = vi.fn()
    sut.onDidChangeTreeData(changed)
    const [shop] = await childrenOf(sut)
    if (shop === undefined) {
      throw new Error('no connection')
    }

    const loading = await childrenOf(sut, shop)
    expect(labelsOf(sut, loading)).toStrictEqual(['Loading databases…'])
    resolve([{ name: 'shop' }])
    await vi.waitFor(() => {
      expect(changed).toHaveBeenCalledWith(shop)
    })

    expect(labelsOf(sut, await childrenOf(sut, shop))).toStrictEqual(['shop'])
  })
})
