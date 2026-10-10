import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSession } from '../../../test/fakes/engine.ts'
import { type RecordingLogger, recordingLogger } from '../../../test/fakes/logger.ts'
import { ScriptedEngine } from '../../../test/support/sessions.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { StatementCategory } from '../../core/safety/statement-class.ts'
import { TransactionEnd, TransactionMode } from '../../core/safety/transaction.ts'
import { CloseReason, EditorTransactions, type TransactionScope } from './editor-transactions.ts'

const URI = 'untitled:Untitled-1'
const WRITE = { category: StatementCategory.Write, isSucceeded: true }

let engine: ScriptedEngine
let status: TransactionStatus
let log: RecordingLogger
let mode: TransactionMode
let sut: EditorTransactions

function session(overrides: Partial<EngineSession> = {}): EngineSession {
  return engine.session({
    transactionStatus: async () => Promise.resolve(status),
    ...overrides,
  })
}

function scope(changes: Partial<TransactionScope> = {}): TransactionScope {
  return { uri: URI, session: session(), place: '"q.sql" on "Shop"', isReadOnly: false, ...changes }
}

function sent(): string[] {
  return engine.requests.map((request) => request.sql)
}

beforeEach(() => {
  resetVscode()
  window.showWarningMessage.mockReset()
  engine = new ScriptedEngine()
  status = TransactionStatus.Idle
  log = recordingLogger()
  mode = TransactionMode.Auto
  sut = new EditorTransactions({ defaultMode: () => mode, log })
})

describe('EditorTransactions', () => {
  it('should start each editor in the mode of the settings', () => {
    expect(sut.of(URI)).toStrictEqual({ mode: 'auto', status: 'idle', statements: 0 })
    mode = TransactionMode.Manual
    expect(sut.of('other').mode).toBe('manual')
  })

  it('should switch modes between transactions, and tell who listens', () => {
    const listener = vi.fn()
    sut.onDidChange(listener)

    expect(sut.switchMode(URI)?.mode).toBe('manual')
    expect(sut.of(URI).mode).toBe('manual')
    expect(listener).toHaveBeenCalledWith(URI)
  })

  it('should run nothing first in auto-commit mode', async () => {
    await sut.beforeStatement(scope())

    expect(sent()).toStrictEqual([])
  })

  it('should open the transaction before the first statement in manual mode, read-only on read-only connections', async () => {
    sut.switchMode(URI)

    await sut.beforeStatement(scope({ isReadOnly: true }))
    await sut.beforeStatement(scope())

    expect(sent()).toStrictEqual(['START TRANSACTION READ ONLY'])
    expect(engine.requests[0]?.maxRows).toBe(0)
    expect(sut.isOpen(URI)).toBe(true)
    expect(log.info).toHaveBeenCalledWith('Began a transaction in "q.sql" on "Shop"')
    expect(sut.switchMode(URI)).toBeUndefined()
  })

  it('should follow what the server says after each statement', async () => {
    status = TransactionStatus.Open
    await expect(sut.afterStatement(scope(), WRITE)).resolves.toBeUndefined()
    expect(sut.of(URI)).toMatchObject({ status: 'open', statements: 1 })

    status = TransactionStatus.Idle
    await expect(
      sut.afterStatement(scope(), { ...WRITE, category: StatementCategory.Ddl }),
    ).resolves.toBe('This statement committed the open transaction: it cannot run inside one.')
    expect(log.warn).toHaveBeenCalledWith(
      '"q.sql" on "Shop": This statement committed the open transaction: it cannot run inside one.',
    )
    expect(sut.isOpen(URI)).toBe(false)
  })

  it('should keep what it knew when the server cannot say', async () => {
    status = TransactionStatus.Open
    await sut.afterStatement(scope(), WRITE)
    const failing = session({ transactionStatus: async () => Promise.reject(new Error('gone')) })

    await sut.afterStatement(scope({ session: failing }), WRITE)

    expect(sut.of(URI)).toMatchObject({ status: 'open', statements: 2 })
    expect(log.warn).toHaveBeenCalledWith('Could not read the transaction status: gone')
  })

  it('should commit or roll back when asked, and say where', async () => {
    status = TransactionStatus.Open
    await sut.afterStatement(scope(), WRITE)

    await expect(sut.end(URI, session(), TransactionEnd.Commit)).resolves.toBe('"q.sql" on "Shop"')

    expect(sent()).toStrictEqual(['COMMIT'])
    expect(sut.isOpen(URI)).toBe(false)
    expect(log.info).toHaveBeenCalledWith('COMMIT in "q.sql" on "Shop"')
    await expect(sut.end('other', fakeSession(), TransactionEnd.Rollback)).resolves.toBe('other')
  })

  it('should roll back what is open before the session closes, and tell why', async () => {
    status = TransactionStatus.Open
    await sut.afterStatement(scope(), WRITE)

    await sut.beforeClose(URI, session(), CloseReason.EditorClosed)
    await sut.beforeClose(URI, session(), CloseReason.EditorClosed)

    expect(sent()).toStrictEqual(['ROLLBACK'])
    expect(window.showWarningMessage).toHaveBeenCalledOnce()
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Rolled back the open transaction of "q.sql" on "Shop": its editor was closed.',
    )
    expect(log.warn).toHaveBeenCalledWith(
      'Rolled back the open transaction of "q.sql" on "Shop" (editorClosed)',
    )
  })

  it.each([
    [CloseReason.ConnectionClosed, 'its connection was closed'],
    [CloseReason.ConnectionChanged, 'its editor moved to another connection'],
  ])('should explain a rollback when %s', async (reason, why) => {
    status = TransactionStatus.Open
    await sut.afterStatement(scope(), WRITE)

    await sut.beforeClose(URI, session(), reason)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      `Rolled back the open transaction of "q.sql" on "Shop": ${why}.`,
    )
  })

  it('should roll back silently when VS Code shuts down, and log a rollback that fails', async () => {
    status = TransactionStatus.Open
    await sut.afterStatement(scope(), WRITE)
    engine.answer = () => ({ error: new Error('connection reset') })

    await sut.beforeClose(URI, session(), CloseReason.Shutdown)

    expect(window.showWarningMessage).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith('Could not roll back "q.sql" on "Shop": connection reset')
  })

  it('should tell when the server ended the session of an open transaction', async () => {
    sut.onLost(URI)
    expect(window.showWarningMessage).not.toHaveBeenCalled()
    status = TransactionStatus.Open
    await sut.afterStatement(scope(), WRITE)

    sut.onLost(URI)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'The connection of "q.sql" on "Shop" ended: the server rolled back its open transaction.',
    )
    expect(sut.isPinned(URI)).toBe(false)
  })

  it('should pin the session of an open transaction, and forget a closed editor', async () => {
    status = TransactionStatus.Open
    sut.switchMode(URI)
    await sut.afterStatement(scope(), WRITE)
    expect(sut.isPinned(URI)).toBe(true)

    sut.forget(URI)

    expect(sut.of(URI)).toStrictEqual({ mode: 'auto', status: 'idle', statements: 0 })
    sut.dispose()
  })
})
