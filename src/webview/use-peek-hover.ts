import { useEffect, useRef } from 'react'

import type { CellPosition } from '../core/grid/selection.ts'
import { placeUnder, type PopupPlace } from './popup.ts'

// The pointer resting on the arrow of a link peeks at the row it points at; leaving it before
// stops the peek.
export interface PeekHover {
  readonly enter: (position: CellPosition, element: Element) => void
  readonly leave: () => void
}

export const PEEK_DELAY_MS = 600

export function usePeekHover(
  onPeek: (position: CellPosition, place: PopupPlace) => void,
): PeekHover {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
    },
    [],
  )
  return {
    enter: (position, element) => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        onPeek(position, placeUnder(element))
      }, PEEK_DELAY_MS)
    },
    leave: () => {
      clearTimeout(timerRef.current)
    },
  }
}
