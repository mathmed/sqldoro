// What a result panel asks of the extension, each action a mock: for the tests of the panel and its
// messages, apart from the runner, the clipboard and the files the actions reach.
import { type Mock, vi } from 'vitest'

import type { PanelActions } from '../../src/extension/results/panel-actions.ts'

export type FakePanelActions = { readonly [K in keyof PanelActions]: Mock }

export function fakePanelActions(): FakePanelActions {
  return {
    cancel: vi.fn(),
    serverView: vi.fn(),
    loadAll: vi.fn(),
    refresh: vi.fn(),
    filterTable: vi.fn(),
    copy: vi.fn(),
    export: vi.fn(),
    copyColumnName: vi.fn(),
    applyEdits: vi.fn(),
    isInOpenTransaction: vi.fn(() => false),
    saveLayout: vi.fn(),
    navigate: vi.fn(),
    openReference: vi.fn(),
    countReferences: vi.fn(),
    peek: vi.fn(),
    goToStep: vi.fn(),
    allowWrites: vi.fn(),
    openInEditor: vi.fn(),
    runQuery: vi.fn(),
    openSqlInEditor: vi.fn(),
    setQueryHeight: vi.fn(),
  }
}
