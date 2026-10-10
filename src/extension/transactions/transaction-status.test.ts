import { beforeEach, describe, expect, it } from 'vitest'

import { type QueryHarness, queryHarness, sqlEditor } from '../../../test/support/query.ts'
import {
  contextKeys,
  resetVscode,
  showEditor,
  statusBarItems,
  ThemeColor,
  workspace,
} from '../../../test/vscode.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'
import { transactionLook } from './transaction-look.ts'
import { TransactionStatusItem } from './transaction-status.ts'

let harness: QueryHarness
let sut: TransactionStatusItem

function item(): (typeof statusBarItems)[number] {
  const found = statusBarItems.find((candidate) => candidate.name === 'sqldoro Transaction')
  if (found === undefined) {
    throw new Error('no transaction item')
  }
  return found
}

beforeEach(() => {
  resetVscode()
  harness = queryHarness()
  sut = new TransactionStatusItem(harness)
})

describe('TransactionStatusItem', () => {
  it('should hide outside SQL editors and for editors without a connection', async () => {
    showEditor(await workspace.openTextDocument({ language: 'markdown', content: '' }))
    sut.update()
    expect(item().isVisible).toBe(false)

    await sqlEditor(harness, 'SELECT 1', null)
    sut.update()
    expect(item().isVisible).toBe(false)
    expect(contextKeys.get('sqldoro.hasOpenTransaction')).toBe(false)
  })

  it('should show the mode of the editor in front, and switch it on click', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    sut.update()
    expect(item()).toMatchObject({
      isVisible: true,
      text: '$(check-all) Auto-commit',
      command: 'sqldoro.toggleTransactionMode',
      backgroundColor: undefined,
    })

    harness.transactions.switchMode(editor.document.uri.toString())
    sut.update()
    expect(item().text).toBe('$(git-commit) Manual commit')
  })

  it('should stand out while a transaction is open', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    harness.engine.status = TransactionStatus.Open
    await harness.transactions.afterStatement(
      {
        uri: editor.document.uri.toString(),
        session: harness.engine.session(),
        place: 'q',
        isReadOnly: false,
      },
      { category: 'write', isSucceeded: true },
    )

    sut.update()

    expect(item()).toMatchObject({
      text: '$(circle-filled) Transaction: 1 statement',
      backgroundColor: new ThemeColor('statusBarItem.warningBackground'),
    })
    expect(contextKeys.get('sqldoro.hasOpenTransaction')).toBe(true)
    sut.dispose()
    expect(item().dispose).toHaveBeenCalledOnce()
  })
})

describe('transactionLook', () => {
  it('should show each state of a transaction', () => {
    expect(
      transactionLook({
        mode: TransactionMode.Auto,
        status: TransactionStatus.Failed,
        statements: 1,
      }),
    ).toStrictEqual({
      text: '$(error) Transaction failed',
      tooltip: 'A statement failed and aborted the transaction: click to roll it back.',
      background: 'statusBarItem.errorBackground',
    })
    expect(
      transactionLook({
        mode: TransactionMode.Manual,
        status: TransactionStatus.Open,
        statements: 3,
      }),
    ).toStrictEqual({
      text: '$(circle-filled) Transaction: 3 statements',
      tooltip: 'A transaction is open on this editor: click to commit or roll it back.',
      background: 'statusBarItem.warningBackground',
    })
    expect(
      transactionLook({
        mode: TransactionMode.Manual,
        status: TransactionStatus.Idle,
        statements: 0,
      }).tooltip,
    ).toBe(
      'The next statement opens a transaction that you commit or roll back. Click to switch to auto-commit.',
    )
    expect(
      transactionLook({ mode: TransactionMode.Auto, status: TransactionStatus.Idle, statements: 0 })
        .tooltip,
    ).toBe('Each statement commits as it runs. Click to switch to manual commit.')
  })
})
