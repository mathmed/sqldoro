import { useState } from 'react'

import type { CellPosition } from '../core/grid/selection.ts'
import type { PopupPlace } from './popup.ts'

// The floating parts of a result, one at a time: the columns it shows, the references of a row, the
// menu of a cell, the peek of the row a link points at.
export const OverlayKind = {
  Columns: 'columns',
  References: 'references',
  CellMenu: 'cellMenu',
  Peek: 'peek',
} as const

export type Overlay =
  | { readonly kind: typeof OverlayKind.Columns; readonly place: PopupPlace }
  | {
      readonly kind: typeof OverlayKind.References
      readonly row: number
      readonly place: PopupPlace
    }
  | {
      readonly kind: typeof OverlayKind.CellMenu | typeof OverlayKind.Peek
      readonly position: CellPosition
      readonly place: PopupPlace
    }

export interface Overlays {
  readonly overlay: Overlay | undefined
  readonly open: (overlay: Overlay) => void
  readonly close: () => void
}

export function useOverlays(): Overlays {
  const [overlay, setOverlay] = useState<Overlay>()
  return {
    overlay,
    open: setOverlay,
    close: () => {
      setOverlay(undefined)
    },
  }
}

// Under an element, or at the point of a click.
export function placeAt(point: { readonly clientX: number; readonly clientY: number }): PopupPlace {
  return { top: point.clientY, left: point.clientX }
}
