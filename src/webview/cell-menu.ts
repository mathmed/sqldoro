import type { CellPosition } from '../core/grid/selection.ts'
import { ExportFormat } from '../core/results/export-format.ts'
import type { MenuItem } from './Menu.tsx'
import { OverlayKind } from './overlays.ts'
import type { PopupPlace } from './popup.ts'
import { peekAt, type ResultModel } from './result-model.ts'

interface MenuTarget {
  readonly position: CellPosition
  readonly place: PopupPlace
  // What a cell does beside its links: show its whole value.
  readonly onDetail: (position: CellPosition) => void
}

// The menu of a cell: the row its link points at (opened, opened here, peeked at), the rows that
// reference its row, copying the selection and its whole value.
export function cellMenuItems(model: ResultModel, target: MenuTarget): MenuItem[] {
  return [...linkItems(model, target), ...rowItems(model, target)]
}

function linkItems(model: ResultModel, { position, place }: MenuTarget): MenuItem[] {
  const { links, projection } = model
  const value = projection.store.row(position.row)?.cells.at(position.column)
  if (!links.isLink(position, value)) {
    return []
  }
  const open = (isInPlace: boolean) => () => {
    links.open(position, isInPlace)
  }
  return [
    { label: 'Open Referenced Row', isDisabled: false, onSelect: open(false) },
    ...(links.canOpenInPlace
      ? [{ label: 'Open Referenced Row Here', isDisabled: false, onSelect: open(true) }]
      : []),
    {
      label: 'Peek Referenced Row',
      isDisabled: false,
      onSelect: () => {
        peekAt(model, position, place)
      },
    },
  ]
}

function rowItems(model: ResultModel, { position, place, onDetail }: MenuTarget): MenuItem[] {
  const hasReferences = model.projection.tab.references.length > 0
  return [
    ...(hasReferences
      ? [
          {
            label: 'Rows That Reference This Row…',
            isDisabled: false,
            onSelect: () => {
              model.overlays.open({ kind: OverlayKind.References, row: position.row, place })
            },
          },
        ]
      : []),
    {
      label: 'Copy',
      isDisabled: false,
      onSelect: () => {
        model.actions.copy(ExportFormat.Tsv)
      },
    },
    {
      label: 'Show Whole Value',
      isDisabled: false,
      onSelect: () => {
        onDetail(position)
      },
    },
  ]
}
