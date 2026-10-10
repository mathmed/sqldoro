import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { Uri } from '../../../test/vscode.ts'
import { tableUri } from '../tables/table-uri.ts'
import { EditorBindings } from './bindings.ts'

const FILE = Uri.parse('file:/work/report.sql') as unknown as vscode.Uri
const UNTITLED = Uri.parse('untitled:Untitled-1') as unknown as vscode.Uri
const SHOP = { connectionId: 'shop', database: 'shop', schema: 'public' }
const CRM = { connectionId: 'crm', database: 'crm', schema: 'crm' }

let memento: FakeMemento
let log: ReturnType<typeof recordingLogger>

beforeEach(() => {
  memento = new FakeMemento()
  log = recordingLogger()
})

describe('EditorBindings', () => {
  it('should run a table panel where its table is, without keeping anything for it', () => {
    const sut = new EditorBindings(memento, log)
    const table = { database: 'shop', schema: 'sales', name: 'orders' }

    expect(sut.get(tableUri({ connectionId: 'shop', table }))).toStrictEqual({
      connectionId: 'shop',
      database: 'shop',
      schema: 'sales',
    })
    expect(memento.keys()).toStrictEqual([])
  })

  it('should keep the connection of files for the next window, and of untitled editors in memory', async () => {
    const sut = new EditorBindings(memento, log)
    const changes = vi.fn()
    sut.onDidChange(changes)

    await sut.set(FILE, SHOP)
    await sut.set(UNTITLED, CRM)

    expect(sut.get(FILE)).toStrictEqual(SHOP)
    expect(sut.get(UNTITLED)).toStrictEqual(CRM)
    expect(changes.mock.calls).toStrictEqual([['file:/work/report.sql'], ['untitled:Untitled-1']])
    const restored = new EditorBindings(memento, log)
    expect(restored.get(FILE)).toStrictEqual(SHOP)
    expect(restored.get(UNTITLED)).toBeUndefined()
  })

  it('should forget a closed untitled editor and keep a closed file', async () => {
    const sut = new EditorBindings(memento, log)
    await sut.set(FILE, SHOP)
    await sut.set(UNTITLED, CRM)
    const changes = vi.fn()
    sut.onDidChange(changes)

    await sut.forgetUntitled(UNTITLED)
    await sut.forgetUntitled(UNTITLED)
    await sut.forgetUntitled(FILE)

    expect(sut.get(UNTITLED)).toBeUndefined()
    expect(sut.get(FILE)).toStrictEqual(SHOP)
    expect(changes).toHaveBeenCalledOnce()
  })

  it('should drop the editors of connections that no longer exist', async () => {
    const sut = new EditorBindings(memento, log)
    await sut.set(FILE, SHOP)
    await sut.set(UNTITLED, CRM)

    await sut.retain(new Set(['crm']))

    expect(sut.get(FILE)).toBeUndefined()
    expect(sut.get(UNTITLED)).toStrictEqual(CRM)
    expect(new EditorBindings(memento, log).get(FILE)).toBeUndefined()
  })

  it('should log the entries it cannot read and keep them', async () => {
    await memento.update('sqldoro.editorConnections', {
      version: 1,
      bindings: [{ uri: 'file:/x' }],
    })

    const sut = new EditorBindings(memento, log)
    await sut.set(FILE, SHOP)

    expect(log.warn).toHaveBeenCalledWith(
      'Editor connection #1 cannot be read: "connectionId" must be a string',
    )
    expect(memento.get('sqldoro.editorConnections')).toStrictEqual({
      version: 1,
      bindings: [{ uri: 'file:/work/report.sql', ...SHOP }, { uri: 'file:/x' }],
    })
  })

  it('should not overwrite connections saved in a format it does not know', async () => {
    await memento.update('sqldoro.editorConnections', { version: 9, bindings: [] })

    const sut = new EditorBindings(memento, log)
    await sut.set(FILE, SHOP)

    expect(sut.get(FILE)).toStrictEqual(SHOP)
    expect(memento.get('sqldoro.editorConnections')).toStrictEqual({ version: 9, bindings: [] })
  })

  it('should stop telling about changes once disposed', async () => {
    const sut = new EditorBindings(memento, log)
    const changes = vi.fn()
    sut.onDidChange(changes)

    sut.dispose()
    await sut.set(FILE, SHOP)

    expect(changes).not.toHaveBeenCalled()
  })
})
