import { columnKeys, hiddenCount, withHidden } from '../core/grid/column-layout.ts'
import type { CellPosition } from '../core/grid/selection.ts'
import { WebviewMessageType } from '../core/results/protocol.ts'
import { type EditActions, editActions } from './edit-messages.ts'
import type { GridColumns, GridLinks } from './grid-props.ts'
import { type LinkActions, linkActions } from './link-actions.ts'
import { OverlayKind, type Overlays, useOverlays } from './overlays.ts'
import { placeUnder, type PopupPlace } from './popup.ts'
import { type Projection, type Sources, useProjection } from './projection.ts'
import { type ResultChoices, toolbarActions, useChoices } from './result-choices.ts'
import type { ToolbarActions } from './Toolbar.tsx'
import type { ToolbarPanels } from './ViewTools.tsx'
import { type WhereSql, whereSql } from './where-source.ts'
import type { SqlDialect } from './where-source.ts'

// Everything the result of a tab is made of: the tab as the grid shows it, what the user chose,
// what floats over it, and what its parts do.
export interface ResultModel {
  readonly projection: Projection
  readonly choices: ResultChoices
  readonly overlays: Overlays
  readonly actions: ToolbarActions
  readonly edits: EditActions
  readonly links: LinkActions
  readonly hiddenColumns: number
  readonly where: WhereSql
}

export function useResultModel(sources: Sources, sql: SqlDialect | null): ResultModel {
  const projection = useProjection(sources)
  const { api, tab } = projection
  const choices = useChoices(tab)
  return {
    projection,
    choices,
    overlays: useOverlays(),
    actions: toolbarActions(projection, choices),
    edits: editActions(api, tab, choices.selection),
    links: linkActions(api, tab),
    hiddenColumns: hiddenCount(sources.tab.columns, sources.tab.layout),
    where: whereSql(sources.tab, sql),
  }
}

// The columns the grid shows, and the rows that reference the selected row, open under the button
// that asked for them.
export function toolbarPanels(model: ResultModel): ToolbarPanels {
  const { overlays, choices } = model
  const row = choices.selection?.focus.row
  return {
    openColumns: (anchor) => {
      overlays.open({ kind: OverlayKind.Columns, place: placeUnder(anchor) })
    },
    openReferences:
      row === undefined
        ? undefined
        : (anchor) => {
            overlays.open({ kind: OverlayKind.References, row, place: placeUnder(anchor) })
          },
    hiddenColumns: model.hiddenColumns,
    whereSql: model.where,
  }
}

// What the cells of links and the menu of a cell open.
export function gridLinks({ links, overlays }: ResultModel): GridLinks {
  return {
    actions: links,
    onPeek: (position, place) => {
      peekAt({ links, overlays }, position, place)
    },
    onCellMenu: (position, place) => {
      overlays.open({ kind: OverlayKind.CellMenu, position, place })
    },
  }
}

// The host reads the row a link points at (once per panel); the popup shows it when it comes.
export function peekAt(
  { links, overlays }: Pick<ResultModel, 'links' | 'overlays'>,
  position: CellPosition,
  place: PopupPlace,
): void {
  links.peek(position)
  overlays.open({ kind: OverlayKind.Peek, position, place })
}

// Hiding a column of the grid hides its column of the result, by its key: a table panel keeps it.
export function gridColumns({ projection }: ResultModel): GridColumns {
  const { source, shown, api, tab } = projection
  return {
    onHide: (column) => {
      const keys = columnKeys(source.tab.columns)
      const hidden = shown
        .slice(column, column + 1)
        .flatMap((index) => keys.slice(index, index + 1))
      source.api.postMessage({
        type: WebviewMessageType.SetLayout,
        tabId: tab.id,
        layout: withHidden(source.tab.layout, hidden, true),
      })
    },
    onFetchDistinct: (column) => {
      api.postMessage({ type: WebviewMessageType.FetchDistinct, tabId: tab.id, column })
    },
    distinct: projection.answers.distinct,
  }
}
