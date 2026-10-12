import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { savedQuery } from '../../../test/fixtures/saved-queries.ts'
import {
  closeDocument,
  contextKeys,
  resetVscode,
  showEditor,
  Uri,
  workspace,
} from '../../../test/vscode.ts'
import { followSavedQueryLinks, SavedQueryLinks } from './saved-query-links.ts'
import { SavedQueryStore } from './saved-query-store.ts'

const FIRST = Uri.parse('untitled:Untitled-1') as unknown as vscode.Uri
const SECOND = Uri.parse('untitled:Untitled-2') as unknown as vscode.Uri
const IS_SAVED_QUERY_EDITOR = 'sqldoro.isSavedQueryEditor'

beforeEach(() => {
  resetVscode()
})

describe('SavedQueryLinks', () => {
  it('should link each document to the saved query it edits', () => {
    const sut = new SavedQueryLinks()

    sut.link(FIRST, 'a')
    sut.link(SECOND, 'b')

    expect(sut.queryOf(FIRST)).toBe('a')
    expect(sut.documentOf('b')).toBe(SECOND.toString())
    expect(sut.documentOf('c')).toBeUndefined()
  })

  it('should tell when a link starts or ends, and only then', () => {
    const sut = new SavedQueryLinks()
    const changed = vi.fn()
    sut.onDidChange(changed)

    sut.link(FIRST, 'a')
    sut.unlink(SECOND)
    sut.unlink(FIRST)
    sut.unlink(FIRST)

    expect(sut.queryOf(FIRST)).toBeUndefined()
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('should drop the links of the saved queries that are gone', () => {
    const sut = new SavedQueryLinks()
    sut.link(FIRST, 'a')
    sut.link(SECOND, 'b')
    const changed = vi.fn()
    sut.onDidChange(changed)

    sut.retain(new Set(['a', 'b']))
    expect(changed).not.toHaveBeenCalled()
    sut.retain(new Set(['a']))

    expect(sut.queryOf(FIRST)).toBe('a')
    expect(sut.queryOf(SECOND)).toBeUndefined()
    expect(changed).toHaveBeenCalledOnce()
    sut.dispose()
  })
})

describe('followSavedQueryLinks', () => {
  async function setUp(): Promise<{
    readonly sut: vscode.Disposable[]
    readonly links: SavedQueryLinks
    readonly store: SavedQueryStore
  }> {
    const store = new SavedQueryStore(new FakeMemento(), recordingLogger())
    await store.replaceAll([savedQuery('a'), savedQuery('b')])
    const links = new SavedQueryLinks()
    return { sut: followSavedQueryLinks(links, store), links, store }
  }

  it('should say whether the editor in front edits a saved query', async () => {
    const { links } = await setUp()
    expect(contextKeys.get(IS_SAVED_QUERY_EDITOR)).toBe(false)
    const document = await workspace.openTextDocument({ language: 'sql', content: 'SELECT a' })
    showEditor(document)

    links.link(document.uri as unknown as vscode.Uri, 'a')
    expect(contextKeys.get(IS_SAVED_QUERY_EDITOR)).toBe(true)
    showEditor(await workspace.openTextDocument({ language: 'sql', content: '' }))

    expect(contextKeys.get(IS_SAVED_QUERY_EDITOR)).toBe(false)
  })

  it('should end the link of a closed editor and of a deleted saved query', async () => {
    const { links, store } = await setUp()
    const closed = await workspace.openTextDocument({ language: 'sql', content: 'SELECT a' })
    const kept = await workspace.openTextDocument({ language: 'sql', content: 'SELECT b' })
    links.link(closed.uri as unknown as vscode.Uri, 'a')
    links.link(kept.uri as unknown as vscode.Uri, 'b')

    closeDocument(closed)
    expect(links.queryOf(closed.uri as unknown as vscode.Uri)).toBeUndefined()
    expect(links.queryOf(kept.uri as unknown as vscode.Uri)).toBe('b')
    await store.delete('b')

    expect(links.queryOf(kept.uri as unknown as vscode.Uri)).toBeUndefined()
  })

  it('should stop following once disposed', async () => {
    const { sut, links } = await setUp()
    const document = await workspace.openTextDocument({ language: 'sql', content: 'SELECT a' })
    links.link(document.uri as unknown as vscode.Uri, 'a')

    for (const disposable of sut) {
      disposable.dispose()
    }
    closeDocument(document)

    expect(links.queryOf(document.uri as unknown as vscode.Uri)).toBe('a')
  })
})
