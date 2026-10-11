import type { ReactElement } from 'react'

import type { CellPosition } from '../core/grid/selection.ts'
import { cellMenuItems } from './cell-menu.ts'
import { requestCell } from './cell-values.ts'
import { ColumnsPanel } from './ColumnsPanel.tsx'
import { MenuList } from './Menu.tsx'
import { type Overlay, OverlayKind } from './overlays.ts'
import { PeekPopup } from './PeekPopup.tsx'
import type { PopupPlace } from './popup.ts'
import { ReferencesPanel } from './ReferencesPanel.tsx'
import type { ResultModel } from './result-model.ts'

// The one panel open over the result, if any: its columns, the references of a row, the menu of a
// cell or the peek of the row a link points at.
export const OverlayView = ({ model }: { readonly model: ResultModel }): ReactElement | null => {
  const { overlay } = model.overlays
  return overlay === undefined ? null : <OpenOverlay model={model} overlay={overlay} />
}

const OpenOverlay = ({
  model,
  overlay,
}: {
  readonly model: ResultModel
  readonly overlay: Overlay
}): ReactElement => {
  switch (overlay.kind) {
    case OverlayKind.Columns:
      return <ColumnsOverlay model={model} place={overlay.place} />
    case OverlayKind.References:
      return <ReferencesOverlay model={model} row={overlay.row} place={overlay.place} />
    case OverlayKind.CellMenu:
      return <CellMenu model={model} position={overlay.position} place={overlay.place} />
    default:
      return <PeekOverlay model={model} position={overlay.position} place={overlay.place} />
  }
}

interface Placed {
  readonly model: ResultModel
  readonly place: PopupPlace
}

const ColumnsOverlay = ({ model, place }: Placed): ReactElement => (
  <ColumnsPanel
    tab={model.projection.source.tab}
    api={model.projection.source.api}
    place={place}
    onClose={model.overlays.close}
  />
)

const ReferencesOverlay = ({
  model,
  row,
  place,
}: Placed & { readonly row: number }): ReactElement => (
  <ReferencesPanel
    tab={model.projection.tab}
    row={row}
    counts={model.projection.answers.counts}
    links={model.links}
    place={place}
    onClose={model.overlays.close}
  />
)

interface AtCell extends Placed {
  readonly position: CellPosition
}

const CellMenu = ({ model, position, place }: AtCell): ReactElement => (
  <MenuList
    label="Cell actions"
    items={cellMenuItems(model, { position, place, onDetail: showDetail(model) })}
    place={place}
    onClose={model.overlays.close}
  />
)

const PeekOverlay = ({ model, position, place }: AtCell): ReactElement => (
  <PeekPopup
    tab={model.projection.tab}
    position={position}
    peek={model.projection.answers.peek}
    links={model.links}
    place={place}
    onClose={model.overlays.close}
  />
)

// The whole value of a cell, in the detail beside the grid: asked of the host when it was cut.
function showDetail({ projection, choices }: ResultModel): (position: CellPosition) => void {
  const { api, tab, store } = projection
  return (position) => {
    choices.setDetail(position)
    requestCell(api, tab, { store, position })
  }
}
