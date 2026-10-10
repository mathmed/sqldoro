import { describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { fakeSession } from '../../../test/fakes/engine.ts'
import { Uri } from '../../../test/vscode.ts'
import { ObjectKind } from '../../core/engine/catalog.ts'
import { DDL_SCHEME, DdlDocuments, ddlTargetOf, ddlUri } from './ddl-documents.ts'

const TARGET = {
  connectionId: 'shop',
  object: { database: 'shop', schema: 'sales', name: 'orders' },
  kind: ObjectKind.Table,
}

describe('ddlUri and ddlTargetOf', () => {
  it('should write the object into a read-only SQL document URI and read it back', () => {
    const uri = ddlUri(TARGET)

    expect(uri.scheme).toBe(DDL_SCHEME)
    expect(uri.path).toBe('/orders.sql')
    expect(ddlTargetOf(uri)).toStrictEqual(TARGET)
  })

  it('should refuse a URI that does not name an object', () => {
    const uri = Uri.from({
      scheme: DDL_SCHEME,
      path: '/x.sql',
      query: '{"connectionId":"shop","kind":"index"}',
    })

    expect(() => ddlTargetOf(uri as unknown as vscode.Uri)).toThrow(
      new TypeError('"database" must be a string'),
    )
  })
})

describe('DdlDocuments', () => {
  it('should show the definition the session gives', async () => {
    const objectDdl = vi.fn(async () => Promise.resolve('CREATE TABLE orders ();'))
    const sut = new DdlDocuments(() => fakeSession({ objectDdl }))

    await expect(sut.provideTextDocumentContent(ddlUri(TARGET))).resolves.toBe(
      'CREATE TABLE orders ();\n',
    )
    expect(objectDdl).toHaveBeenCalledWith(TARGET.object, ObjectKind.Table)
  })

  it('should say when the connection is not open', async () => {
    const sut = new DdlDocuments(() => undefined)

    await expect(sut.provideTextDocumentContent(ddlUri(TARGET))).resolves.toBe(
      '-- Not connected: connect to see the definition.\n',
    )
  })

  it('should tell VS Code to read a document again', () => {
    const sut = new DdlDocuments(() => undefined)
    const changes = vi.fn()
    sut.onDidChange(changes)

    sut.refresh(ddlUri(TARGET))
    sut.dispose()
    sut.refresh(ddlUri(TARGET))

    expect(changes).toHaveBeenCalledOnce()
  })
})
