import type { EditKind } from '../core/edits/edit-kind.ts'
import { type GridSelection, rangeBlock, selectionRange } from '../core/grid/selection.ts'
import { type CellBlock, type ResultTab, WebviewMessageType } from '../core/results/protocol.ts'
import type { ResultsApi } from './results-api.ts'

// The edits of the toolbar and the keyboard, on the selection or on the whole result.
export interface EditActions {
  readonly onSelection: (kind: EditKind) => void
  readonly onResult: (kind: EditKind) => void
  readonly preview: () => void
  readonly closePreview: () => void
  readonly apply: (previewId: number) => void
}

export function editActions(
  api: ResultsApi,
  tab: ResultTab,
  selection: GridSelection | undefined,
): EditActions {
  return {
    onSelection: (kind) => {
      if (selection !== undefined) {
        sendEdit(api, tab, { kind, block: rangeBlock(selectionRange(selection)) })
      }
    },
    onResult: (kind) => {
      sendEdit(api, tab, { kind, block: null })
    },
    preview: () => {
      api.postMessage({ type: WebviewMessageType.PreviewEdits, tabId: tab.id })
    },
    closePreview: () => {
      api.postMessage({ type: WebviewMessageType.ClosePreview, tabId: tab.id })
    },
    apply: (previewId) => {
      api.postMessage({ type: WebviewMessageType.ApplyEdits, tabId: tab.id, previewId })
    },
  }
}

// An edit names the view it was made on: the host drops it if the view changed meanwhile.
function sendEdit(
  api: ResultsApi,
  tab: ResultTab,
  edit: { readonly kind: EditKind; readonly block: CellBlock | null },
): void {
  const { id: tabId, viewVersion } = tab
  api.postMessage({
    type: WebviewMessageType.Edit,
    tabId,
    viewVersion,
    edit: { ...edit, input: '' },
  })
}
