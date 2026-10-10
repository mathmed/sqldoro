import { useState } from 'react'

import { EditKind } from '../core/edits/edit-kind.ts'
import { readValue } from '../core/edits/values.ts'
import type { CellValue } from '../core/engine/query.ts'
import type { ValueSpec } from '../core/engine/table.ts'
import type { CellPosition } from '../core/grid/selection.ts'
import { type CellMessage, type ResultTab, WebviewMessageType } from '../core/results/protocol.ts'
import { requestCell, wholeValue } from './cell-values.ts'
import { cellSpec, pendingDraft, rowEditAt } from './edit-overlay.ts'
import type { ResultsApi } from './results-api.ts'
import type { RowStore } from './row-store.ts'

// The cell being edited: where, on which view of the rows, and what was typed (undefined until
// something is: the editor then shows the value of the cell).
interface Opened {
  readonly position: CellPosition
  readonly viewVersion: number
  readonly draft: string | undefined
}

export interface CellEditorView {
  readonly position: CellPosition
  readonly spec: ValueSpec
  // Undefined while the whole value of a cut cell is on its way from the host.
  readonly text: string | undefined
  // Why the text cannot be written, as soon as something is typed; empty when it can.
  readonly problem: string
}

// An open editor, and what can be done in it.
export interface OpenEditor {
  readonly view: CellEditorView
  readonly change: (text: string) => void
  // True when the editor closes: the value went, or nothing was typed.
  readonly commit: () => boolean
  readonly cancel: () => void
}

export interface CellEditing {
  readonly editor: OpenEditor | undefined
  // Edits a cell that takes values (the grid opens no other): from its value, or from what was typed.
  readonly open: (position: CellPosition, typed: string | undefined) => void
}

export interface EditorSource {
  readonly store: RowStore
  readonly cell: CellMessage | undefined
}

interface EditorContext extends EditorSource {
  readonly api: ResultsApi
  readonly tab: ResultTab
  readonly setOpened: (opened: Opened | undefined) => void
}

export function useCellEditor(api: ResultsApi, tab: ResultTab, source: EditorSource): CellEditing {
  const [opened, setOpened] = useState<Opened>()
  const editor =
    opened === undefined ? undefined : editorOf(opened, { api, tab, ...source, setOpened })
  // An editor whose cell takes no value now (another view of the rows, a row marked for deletion,
  // an apply running) closes for good.
  if (opened !== undefined && editor === undefined) {
    setOpened(undefined)
  }
  return {
    editor,
    open: (position, typed) => {
      askWholeValue(api, tab, { store: source.store, position })
      setOpened({ position, viewVersion: tab.viewVersion, draft: typed })
    },
  }
}

function editorOf(opened: Opened, context: EditorContext): OpenEditor | undefined {
  const view = viewOf(opened, context)
  if (view === undefined) {
    return undefined
  }
  const close = (): void => {
    context.setOpened(undefined)
  }
  return {
    view,
    change: (text) => {
      context.setOpened({ ...opened, draft: text })
    },
    commit: () => {
      const isClosing = send(context, { opened, view })
      if (isClosing) {
        close()
      }
      return isClosing
    },
    cancel: close,
  }
}

function viewOf(opened: Opened, context: EditorContext): CellEditorView | undefined {
  const spec = cellSpec(context.tab, opened.position)
  if (spec === undefined || opened.viewVersion !== context.tab.viewVersion) {
    return undefined
  }
  return {
    position: opened.position,
    spec,
    text: opened.draft ?? startText(opened.position, context),
    problem: problemOf(opened.draft, spec),
  }
}

function problemOf(draft: string | undefined, spec: ValueSpec): string {
  const reading = draft === undefined ? undefined : readValue(draft, spec)
  return reading === undefined || reading.isValid ? '' : reading.problem
}

// What the cell will hold, or holds: NULL starts empty.
function startText(position: CellPosition, context: EditorContext): string | undefined {
  const pending = rowEditAt(context.tab, position.row)?.cells.get(position.column)
  if (pending !== undefined) {
    return pendingDraft(pending)
  }
  return position.row < context.tab.rowCount ? heldText(position, context) : ''
}

function heldText(position: CellPosition, context: EditorContext): string | undefined {
  const value = wholeValue({ store: context.store, position }, context)
  return value === undefined ? undefined : textOf(value)
}

function textOf(value: CellValue): string {
  return value === null ? '' : String(value)
}

// A cut value comes whole from the host before it can be edited.
function askWholeValue(
  api: ResultsApi,
  tab: ResultTab,
  place: { readonly store: RowStore; readonly position: CellPosition },
): void {
  const isPending = rowEditAt(tab, place.position.row)?.cells.has(place.position.column) === true
  if (!isPending && place.position.row < tab.rowCount) {
    requestCell(api, tab, place)
  }
}

interface Sending {
  readonly opened: Opened
  readonly view: CellEditorView
}

// Nothing typed closes without an edit; a value the column cannot hold keeps the editor open.
function send({ api, tab }: EditorContext, { opened, view }: Sending): boolean {
  if (opened.draft === undefined) {
    return true
  }
  if (view.problem !== '') {
    return false
  }
  const { row, column } = opened.position
  api.postMessage({
    type: WebviewMessageType.Edit,
    tabId: tab.id,
    viewVersion: opened.viewVersion,
    edit: {
      kind: EditKind.Set,
      range: { firstRow: row, lastRow: row, firstColumn: column, lastColumn: column },
      input: opened.draft,
    },
  })
  return true
}
