import type { ReactElement } from 'react'

import { withNoneHidden } from '../core/grid/column-layout.ts'
import { TabKind, TabStatus, WebviewMessageType } from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import { requestCell } from './cell-values.ts'
import type { GridEdit } from './grid-props.ts'
import { Grid } from './Grid.tsx'
import { LoadingOverlay, Skeleton } from './LoadingCard.tsx'
import { PlanView } from './PlanView.tsx'
import { gridColumns, gridLinks, type ResultModel } from './result-model.ts'
import type { ViewContext } from './view-context.ts'
import { hasSkeleton, isDimmed, type Waiting } from './waiting.ts'

interface ResultMainProps {
  readonly model: ResultModel
  readonly edit: GridEdit
  readonly context: ViewContext
  readonly waiting: Waiting
}

// The rows or the plan of the result. While the view waits (a statement runs, the rows of a new
// view are on their way), what it shows stays as it is; a wait long enough to notice dims it and
// shows a card that says what the view waits for. Before the first rows of a result, a skeleton
// stands where they go.
export const ResultMain = (props: ResultMainProps): ReactElement => {
  const { waiting, model } = props
  const { indicator, awaited, incoming } = waiting
  return (
    <div
      className={isDimmed(waiting) ? 'result-main is-dimmed' : 'result-main'}
      aria-busy={waiting.isWaiting}
    >
      {hasSkeleton(waiting) ? <Skeleton /> : null}
      <div
        className="result-content"
        inert={incoming !== undefined && incoming.id !== model.projection.tab.id}
      >
        <ResultContent {...props} />
      </div>
      <LoadingOverlay indicator={indicator} tab={awaited} onCancel={model.actions.cancel} />
    </div>
  )
}

const ResultContent = ({ model, edit, context, waiting }: ResultMainProps): ReactElement | null => {
  const { tab, source } = model.projection
  if (tab.kind === TabKind.Plan) {
    return <PlanView lines={tab.plan} />
  }
  if (tab.columns.length === 0) {
    return source.tab.columns.length === 0 ? null : <AllHidden model={model} />
  }
  return <ResultGrid model={model} edit={edit} context={context} waiting={waiting} />
}

const ResultGrid = ({ model, edit, context, waiting }: ResultMainProps): ReactElement => {
  const { incoming } = waiting
  const { projection, choices, actions } = model
  const { tab, store, api } = projection
  return (
    <Grid
      api={api}
      tab={tab}
      store={store}
      fetching={incoming?.id === tab.id ? incoming : tab}
      selection={choices.selection}
      onSelect={choices.setSelection}
      onOpenDetail={(position) => {
        choices.setDetail(position)
        requestCell(api, tab, { store, position })
      }}
      onView={(view) => {
        changeView(model, view)
      }}
      onCopy={actions.copy}
      edit={edit}
      links={gridLinks(model)}
      columns={gridColumns(model)}
      scroll={{ step: context.step, scrolls: context.scrolls }}
    />
  )
}

// While the statement runs, the rows are still coming: the view waits for the end.
function changeView({ projection, choices }: ResultModel, view: ViewSpec): void {
  const { tab, api } = projection
  if (tab.status !== TabStatus.Running) {
    api.postMessage({
      type: WebviewMessageType.SetView,
      tabId: tab.id,
      view,
      isServerSide: choices.isServerSide,
    })
  }
}

// Every column hidden: the grid has nothing to show but the way back.
const AllHidden = ({ model }: { readonly model: ResultModel }): ReactElement => {
  const { source } = model.projection
  return (
    <div className="empty-state">
      <p>Every column of the result is hidden.</p>
      <button
        type="button"
        className="primary"
        onClick={() => {
          source.api.postMessage({
            type: WebviewMessageType.SetLayout,
            tabId: source.tab.id,
            layout: withNoneHidden(source.tab.layout),
          })
        }}
      >
        Show All Columns
      </button>
    </div>
  )
}
