import type { ReactElement } from 'react'

import { EditKind } from '../core/edits/edit-kind.ts'
import type { ExportFormat } from '../core/results/export-format.ts'
import {
  type CellMessage,
  type PanelConnection,
  type ResultTab,
  TabKind,
  TabStatus,
  WebviewMessageType,
} from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import { requestCell, wholeValue } from './cell-values.ts'
import { CellDetail } from './CellDetail.tsx'
import { type EditActions, editActions } from './edit-messages.ts'
import { isEditing } from './edit-overlay.ts'
import { EditBar } from './EditBar.tsx'
import { Grid, type GridEdit } from './Grid.tsx'
import { PlanView } from './PlanView.tsx'
import { PreviewDialog } from './PreviewDialog.tsx'
import { type ResultChoices, toolbarActions, useChoices } from './result-choices.ts'
import type { ResultsApi } from './results-api.ts'
import type { RowStore } from './row-store.ts'
import { StatusLine } from './StatusLine.tsx'
import { Toolbar } from './Toolbar.tsx'
import { type CellEditing, useCellEditor } from './use-cell-editor.ts'

interface ResultViewProps {
  readonly tab: ResultTab
  readonly store: RowStore
  readonly api: ResultsApi
  readonly cell: CellMessage | undefined
  // Where the statements of the changes would run, for their preview.
  readonly connection: PanelConnection | null
  // Whether tabs above name the results of the run; without them, the result names itself.
  readonly hasTabs: boolean
}

// The result of one statement: its actions, its rows or plan, what happened and the editing of its
// rows, with the preview of their changes.
export const ResultView = (props: ResultViewProps): ReactElement => {
  const { tab, store, api, cell } = props
  const choices = useChoices(tab)
  const actions = toolbarActions(api, tab, choices)
  const edits = editActions(api, tab, choices.selection)
  const edit = gridEdit(tab, { editing: useCellEditor(api, tab, { store, cell }), edits })
  return (
    <section {...panelRole(tab, props.hasTabs)} id="result-panel" className="result-view">
      <Toolbar
        tab={tab}
        hasSelection={choices.selection !== undefined}
        isServerSide={choices.isServerSide}
        actions={actions}
        edits={edits}
      />
      <div className="result-body">
        <ResultContent content={{ tab, store, api, choices, edit }} onCopy={actions.copy} />
        <DetailPanel tab={tab} store={store} cell={cell} choices={choices} />
      </div>
      <footer className="result-footer">
        <StatusLine tab={tab} />
        <EditBar tab={tab} />
      </footer>
      <ChangesPreview tab={tab} edits={edits} connection={props.connection} />
    </section>
  )
}

// The panel of a tab, or the only result of the run, named by its statement.
function panelRole(tab: ResultTab, hasTabs: boolean): Record<string, string> {
  return hasTabs
    ? { role: 'tabpanel', 'aria-labelledby': `tab-${tab.id}` }
    : { role: 'region', 'aria-label': `Result of ${tab.title}` }
}

const ChangesPreview = ({
  tab,
  edits,
  connection,
}: {
  readonly tab: ResultTab
  readonly edits: EditActions
  readonly connection: PanelConnection | null
}): ReactElement | null => {
  const { preview } = tab.editing
  return preview === null ? null : (
    <PreviewDialog
      preview={preview}
      connection={connection}
      onApply={edits.apply}
      onClose={edits.closePreview}
    />
  )
}

// The keyboard of the grid edits only while the rows can be edited.
function gridEdit(
  tab: ResultTab,
  { editing, edits }: { readonly editing: CellEditing; readonly edits: EditActions },
): GridEdit {
  return {
    editor: editing.editor,
    start: editing.open,
    deleteRows: () => {
      if (isEditing(tab)) {
        edits.onSelection(EditKind.Delete)
      }
    },
    preview: () => {
      if (isEditing(tab)) {
        edits.preview()
      }
    },
  }
}

interface Content {
  readonly tab: ResultTab
  readonly store: RowStore
  readonly api: ResultsApi
  readonly choices: ResultChoices
  readonly edit: GridEdit
}

const ResultContent = ({
  content,
  onCopy,
}: {
  readonly content: Content
  readonly onCopy: (format: ExportFormat) => void
}): ReactElement | null => {
  const { tab, store, api, choices, edit } = content
  if (tab.kind === TabKind.Plan) {
    return <PlanView lines={tab.plan} />
  }
  return tab.columns.length === 0 ? null : (
    <Grid
      api={api}
      tab={tab}
      store={store}
      selection={choices.selection}
      onSelect={choices.setSelection}
      onOpenDetail={(position) => {
        choices.setDetail(position)
        requestCell(api, tab, { store, position })
      }}
      onView={(view) => {
        changeView(api, tab, { view, isServerSide: choices.isServerSide })
      }}
      onCopy={onCopy}
      edit={edit}
    />
  )
}

interface ViewChange {
  readonly view: ViewSpec
  readonly isServerSide: boolean
}

// While the statement runs, the rows are still coming: the view waits for the end.
function changeView(api: ResultsApi, tab: ResultTab, change: ViewChange): void {
  if (tab.status !== TabStatus.Running) {
    api.postMessage({ type: WebviewMessageType.SetView, tabId: tab.id, ...change })
  }
}

interface DetailPanelProps {
  readonly tab: ResultTab
  readonly store: RowStore
  readonly cell: CellMessage | undefined
  readonly choices: ResultChoices
}

const DetailPanel = ({ tab, store, cell, choices }: DetailPanelProps): ReactElement | null => {
  const position = choices.detail
  const column = position === undefined ? undefined : tab.columns.at(position.column)
  if (position === undefined || column === undefined) {
    return null
  }
  return (
    <CellDetail
      column={column}
      value={wholeValue({ store, position }, { cell, tab })}
      onClose={() => {
        choices.setDetail(undefined)
      }}
    />
  )
}
