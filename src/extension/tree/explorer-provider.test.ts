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
import {
  DEFAULT_SSH_TUNNEL,
  EnvironmentTag,
  newConnection,
  SslMode,
} from '../../core/connection/connection.ts'
import type { ExplorerNode } from './explorer-node.ts'

const LOCAL = {
  ...newConnection('local', MYSQL),
  name: 'local db',
  user: 'root',
  environment: EnvironmentTag.None,
}

describe('ExplorerProvider', () => {
  describe('connections', () => {
    it('should list the connections by name', async () => {
      const { sut } = explorer([SHOP, LOCAL])

      expect(labelsOf(sut, await childrenOf(sut))).toStrictEqual(['local db', 'Shop'])
    })

    it('should show the environment, whether it writes and the status of a connection, not its host', async () => {
      const { sut } = explorer([SHOP, LOCAL])
      const roots = await childrenOf(sut)

      const shop = itemOf(sut, roots, 'Shop')
      const local = itemOf(sut, roots, 'local db')

      expect(shop).toMatchObject({
        description: 'PROD · 🔒',
        contextValue: 'connection.disconnected.readOnly',
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      })
      expect(shop.iconPath).toStrictEqual(
        new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('charts.red')),
      )
      expect(local.description).toBe('🔒')
      expect(local.iconPath).toStrictEqual(new vscode.ThemeIcon('debug-disconnect', undefined))
    })

    it('should say when a connection may write', async () => {
      const { sut } = explorer([{ ...LOCAL, isReadOnly: false }])

      expect(itemOf(sut, await childrenOf(sut), 'local db')).toMatchObject({
        description: '',
        contextValue: 'connection.disconnected.writable',
      })
    })

    it('should describe the connection in its tooltip', async () => {
      const { sut } = explorer([
        SHOP,
        {
          ...LOCAL,
          isReadOnly: false,
          ssh: { ...DEFAULT_SSH_TUNNEL, host: 'bastion', user: 'ops' },
          ssl: { ...LOCAL.ssl, mode: SslMode.VerifyFull },
        },
      ])
      const roots = await childrenOf(sut)

      expect(itemOf(sut, roots, 'Shop').tooltip).toBe(
        [
          'Shop',
          'PostgreSQL · app@localhost:5432/shop',
          'Environment: Production',
          'Read-only: sqldoro and the session refuse writes',
          'SSL: Disabled',
          'SSH tunnel: none',
          'Status: disconnected',
        ].join('\n'),
      )
      expect(itemOf(sut, roots, 'local db').tooltip).toBe(
        [
          'local db',
          'MySQL · root@localhost:3306',
          'Environment: None',
          'Writes allowed',
          'SSL: Verify full',
          'SSH tunnel: ops@bastion:22',
          'Status: disconnected',
        ].join('\n'),
      )
    })

    it('should show an engine nobody registered by its id', async () => {
      const { sut } = explorer([{ ...SHOP, engine: 'oracle' }])

      expect(itemOf(sut, await childrenOf(sut), 'Shop').tooltip).toEqual(
        expect.stringContaining('oracle · app@localhost'),
      )
    })

    it('should offer to connect a disconnected connection', async () => {
      const { sut } = explorer([SHOP])

      const [message] = await open(sut, 'Shop')

      expect(message === undefined ? undefined : sut.getTreeItem(message)).toMatchObject({
        label: 'Not connected: select to connect',
        iconPath: new vscode.ThemeIcon('info'),
        contextValue: 'message',
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        command: { command: 'sqldoro.connect', title: 'Connect', arguments: ['shop'] },
      })
    })

    it('should show a connection in progress', async () => {
      const { sut, sessions } = explorer([SHOP])
      const connecting = sessions.connect(SHOP)

      const roots = await childrenOf(sut)
      const children = await childrenOf(sut, roots[0])
      await connecting

      expect(itemOf(sut, roots, 'Shop').contextValue).toBe('connection.connected.readOnly')
      expect(labelsOf(sut, children)).toStrictEqual(['Connecting…'])
    })

    it('should show why a connection failed and offer to try again', async () => {
      const { sut, sessions } = explorer([SHOP], { openError: new Error('Access denied') })
      await expect(sessions.connect(SHOP)).rejects.toThrow('Access denied')
      const roots = await childrenOf(sut)

      const [message] = await childrenOf(sut, roots[0])

      expect(itemOf(sut, roots, 'Shop')).toMatchObject({
        contextValue: 'connection.failed.readOnly',
        iconPath: new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground')),
      })
      expect(itemOf(sut, roots, 'Shop').tooltip).toEqual(
        expect.stringContaining('Status: failed: Access denied'),
      )
      expect(message === undefined ? undefined : sut.getTreeItem(message).command?.command).toBe(
        'sqldoro.connect',
      )
    })
  })

  it('should report a connected server in the tooltip', async () => {
    const { sut, sessions } = explorer([SHOP])
    await sessions.connect(SHOP)

    expect(itemOf(sut, await childrenOf(sut), 'Shop').tooltip).toEqual(
      expect.stringContaining('Status: connected, server 18.6'),
    )
  })

  it('should stop listening to the sessions once disposed', async () => {
    const { sut, sessions } = explorer([SHOP])
    const listener = vi.fn()
    sut.onDidChangeTreeData(listener)
    await childrenOf(sut)

    sut.dispose()
    await sessions.connect(SHOP)

    expect(listener).not.toHaveBeenCalled()
  })

  it('should refresh a connection node when its status changes, once VS Code has it', async () => {
    const { sut, sessions } = explorer([SHOP])
    const fired: (ExplorerNode | undefined)[] = []
    sut.onDidChangeTreeData((node) => fired.push(node))

    await sessions.connect({ ...SHOP, id: 'not-shown' })
    const [root] = await childrenOf(sut)
    await sessions.disconnect('shop')

    expect(fired).toStrictEqual([root])
  })
})
