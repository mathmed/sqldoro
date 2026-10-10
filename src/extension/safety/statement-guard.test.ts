import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type RecordingLogger, recordingLogger } from '../../../test/fakes/logger.ts'
import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { SHOP } from '../../../test/support/query.ts'
import { commands, resetVscode, window } from '../../../test/vscode.ts'
import { type ConnectionConfig, EnvironmentTag } from '../../core/connection/connection.ts'
import { newTransaction, TransactionMode } from '../../core/safety/transaction.ts'
import { CommandId } from '../command-id.ts'
import { type GuardRequest, StatementGuard } from './statement-guard.ts'

let log: RecordingLogger
let sut: StatementGuard

function request(statements: readonly string[], changes: Partial<GuardRequest> = {}): GuardRequest {
  return {
    connection: SHOP,
    dialect: POSTGRES_DIALECT,
    statements,
    transaction: newTransaction(TransactionMode.Auto),
    ...changes,
  }
}

function on(connection: Partial<ConnectionConfig>): Pick<GuardRequest, 'connection'> {
  return { connection: { ...SHOP, ...connection } }
}

// What the input box asks, and what it accepts.
function inputBox(): { title: string; prompt: string; validateInput: (value: string) => unknown } {
  return window.showInputBox.mock.calls.at(-1)?.[0] as never
}

beforeEach(() => {
  resetVscode()
  for (const prompt of [window.showErrorMessage, window.showWarningMessage, window.showInputBox]) {
    prompt.mockReset()
  }
  log = recordingLogger()
  sut = new StatementGuard({
    policy: () => ({ productionEnvironments: new Set(['prod']) }),
    log,
  })
})

describe('StatementGuard.approve', () => {
  it('should approve reads at once and tell what each statement does', async () => {
    const approval = await sut.approve(request(['SELECT 1', 'SHOW search_path']))

    expect(approval?.classOf('SELECT 1')).toMatchObject({ category: 'read', verb: 'SELECT' })
    expect(log.debug).toHaveBeenCalledWith('Guard: allowed SELECT, SHOW on "Shop"')
    expect(window.showInputBox).not.toHaveBeenCalled()
  })

  it('should log the writes it lets run', async () => {
    await sut.approve(request(['INSERT INTO t VALUES (1)', 'INSERT INTO t VALUES (2)']))

    expect(log.info).toHaveBeenCalledWith('Guard: allowed INSERT on "Shop"')
  })

  it('should refuse to run a statement it did not see', async () => {
    const approval = await sut.approve(request(['SELECT 1']))

    expect(() => approval?.classOf('DELETE FROM t')).toThrow(
      'sqldoro did not check this statement before running it, so it did not run',
    )
  })

  it('should block writes on a read-only connection and offer to allow them', async () => {
    window.showErrorMessage.mockResolvedValue('Allow Writes…')
    const allowWrites = vi.fn()
    const registration = commands.registerCommand(CommandId.AllowWrites, allowWrites)

    const approval = await sut.approve(
      request(['DELETE FROM t WHERE id = 1'], on({ isReadOnly: true })),
    )

    expect(approval).toBeUndefined()
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      '"Shop" is read-only: sqldoro did not run this DELETE. To write, allow writes on the connection first.',
      'Allow Writes…',
    )
    expect(log.warn).toHaveBeenCalledWith(
      'Guard: blocked DELETE on "Shop": the connection is read-only',
    )
    await vi.waitFor(() => {
      expect(allowWrites).toHaveBeenCalledWith('shop')
    })
    registration.dispose()
  })

  it('should leave the connection as it is when the message is dismissed', async () => {
    window.showErrorMessage.mockResolvedValue(undefined)
    const allowWrites = vi.fn()
    const registration = commands.registerCommand(CommandId.AllowWrites, allowWrites)

    await sut.approve(request(['DROP TABLE t'], on({ isReadOnly: true })))
    await Promise.resolve()

    expect(allowWrites).not.toHaveBeenCalled()
    registration.dispose()
  })

  it('should run an UPDATE of every row only once its table is typed, and log the override', async () => {
    window.showInputBox.mockResolvedValue(' orders ')

    const approval = await sut.approve(request(['UPDATE orders SET paid = true']))

    expect(approval).toBeDefined()
    expect(inputBox()).toMatchObject({
      title: 'UPDATE of every row of orders',
      prompt:
        'This UPDATE changes every row of orders: it has no WHERE. Type orders to run it anyway.',
      placeHolder: 'orders',
      ignoreFocusOut: true,
    })
    expect(inputBox().validateInput('order')).toBe('Type orders exactly to confirm')
    expect(inputBox().validateInput('orders')).toBeUndefined()
    expect(log.warn).toHaveBeenCalledWith(
      'Guard override on "Shop": UPDATE of every row of orders (it has no WHERE) confirmed',
    )
  })

  it.each([undefined, 'ORDERS'])(
    'should run nothing when the table is not typed (%s)',
    async (typed) => {
      window.showInputBox.mockResolvedValue(typed)

      await expect(sut.approve(request(['DELETE FROM orders']))).resolves.toBeUndefined()
      expect(log.info).toHaveBeenCalledWith('Guard: not confirmed, nothing ran on "Shop"')
    },
  )

  it('should ask for the name of a production connection after the table, and stop at the first refusal', async () => {
    window.showInputBox.mockResolvedValueOnce('t').mockResolvedValueOnce('Shop')
    const production = on({ environment: EnvironmentTag.Production })

    await expect(sut.approve(request(['DELETE FROM t'], production))).resolves.toBeDefined()
    expect(
      window.showInputBox.mock.calls.map(([options]) => (options as { title: string }).title),
    ).toStrictEqual(['DELETE of every row of t', 'PROD: Shop'])

    window.showInputBox.mockReset()
    window.showInputBox.mockResolvedValue(undefined)
    await expect(sut.approve(request(['DELETE FROM t'], production))).resolves.toBeUndefined()
    expect(window.showInputBox).toHaveBeenCalledOnce()
  })

  it('should warn before DDL in a transaction where it commits at once, and run it only if asked', async () => {
    const mysql = { dialect: MYSQL_DIALECT, transaction: newTransaction(TransactionMode.Manual) }
    window.showWarningMessage
      .mockResolvedValueOnce('Run and Commit')
      .mockResolvedValueOnce(undefined)

    await expect(sut.approve(request(['ALTER TABLE t ADD c int'], mysql))).resolves.toBeDefined()
    await expect(sut.approve(request(['DROP TABLE t'], mysql))).resolves.toBeUndefined()

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'ALTER commits the open transaction and cannot be rolled back: this database commits DDL at once.',
      { modal: true, detail: 'The statements before it in the transaction are committed too.' },
      'Run and Commit',
    )
    expect(log.info).toHaveBeenCalledWith('Guard: DDL in a transaction on "Shop" confirmed')
    expect(log.info).toHaveBeenCalledWith('Guard: DDL in a transaction on "Shop" not confirmed')
  })
})
