import type { ReactElement } from 'react'

import { EditKind } from '../core/edits/edit-kind.ts'
import type { PanelConnection } from '../core/results/protocol-parts.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { wholeValue } from './cell-values.ts'
import { CellDetail } from './CellDetail.tsx'
import type { EditActions } from './edit-messages.ts'
import { isEditing } from './edit-overlay.ts'
import { EditBar } from './EditBar.tsx'
import type { GridEdit } from './grid-props.ts'
import type { HostAnswers } from './host-answers.ts'
import { OverlayView } from './OverlayView.tsx'
import { PreviewDialog } from './PreviewDialog.tsx'
import { type ResultModel, toolbarPanels, useResultModel } from './result-model.ts'
import { ResultMain } from './ResultMain.tsx'
import type { ResultsApi } from './results-api.ts'
import type { RowStore } from './row-store.ts'
import { StatusLine } from './StatusLine.tsx'
import { Toolbar } from './Toolbar.tsx'
import { type CellEditing, useCellEditor } from './use-cell-editor.ts'
import type { QueryModeSwitch, ViewContext } from './view-context.ts'
import { useWaiting, viewClassName } from './waiting.ts'

interface ResultViewProps {
  readonly tab: ResultTab
  // What the view waits for while this result stays on screen: a new view of the tab, or the tab of
  // a new run.
  readonly incoming: ResultTab | undefined
  readonly store: RowStore
  readonly api: ResultsApi
  readonly answers: HostAnswers
  readonly context: ViewContext
  // Whether tabs above name the results of the run; without them, the result names itself.
  readonly hasTabs: boolean
}

// The result of one statement: its actions, its rows or plan, what happened and the editing of its
// rows, with the preview of their changes. The grid shows the columns the layout shows, in its
// order; the panels over it open one at a time.
export const ResultView = (props: ResultViewProps): ReactElement => {
  const model = useResultModel(props, props.context.sql)
  const { tab, api, store, answers } = model.projection
  const edit = gridEdit(tab, {
    editing: useCellEditor(api, tab, { store, cell: answers.cell }),
    edits: model.edits,
  })
  const { connection, indicator } = props.context
  const waiting = useWaiting({ tab, store, incoming: props.incoming, indicator })
  return (
    <section
      {...panelRole(tab, props.hasTabs)}
      id="result-panel"
      className={viewClassName(waiting)}
    >
      <ResultToolbar model={model} queryMode={props.context.queryMode} />
      <div className="result-body">
        <ResultMain model={model} edit={edit} context={props.context} waiting={waiting} />
        <DetailPanel model={model} />
      </div>
      <ResultFooter model={model} connection={connection} />
      <ChangesPreview tab={tab} edits={model.edits} connection={connection} />
      <OverlayView model={model} />
    </section>
  )
}

const ResultToolbar = ({
  model,
  queryMode,
}: {
  readonly model: ResultModel
  readonly queryMode: QueryModeSwitch
}): ReactElement => (
  <Toolbar
    tab={model.projection.tab}
    hasSelection={model.choices.selection !== undefined}
    isServerSide={model.choices.isServerSide}
    actions={model.actions}
    edits={model.edits}
    panels={toolbarPanels(model)}
    queryMode={queryMode}
  />
)

const ResultFooter = ({
  model,
  connection,
}: {
  readonly model: ResultModel
  readonly connection: PanelConnection | null
}): ReactElement => (
  <footer className="result-footer">
    <StatusLine
      tab={model.projection.tab}
      hiddenColumns={model.hiddenColumns}
      onShowColumns={toolbarPanels(model).openColumns}
    />
    <EditBar tab={model.projection.tab} isConnectionReadOnly={connection?.isReadOnly === true} />
  </footer>
)

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

const DetailPanel = ({ model }: { readonly model: ResultModel }): ReactElement | null => {
  const { tab, store, answers } = model.projection
  const position = model.choices.detail
  const column = position === undefined ? undefined : tab.columns.at(position.column)
  if (position === undefined || column === undefined) {
    return null
  }
  return (
    <CellDetail
      column={column}
      value={wholeValue({ store, position }, { cell: answers.cell, tab })}
      onClose={() => {
        model.choices.setDetail(undefined)
      }}
    />
  )
}
