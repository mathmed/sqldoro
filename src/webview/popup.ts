import { type RefObject, useEffect } from 'react'

// Where a menu or a popover opens, in the window: under what opened it, on the side of the window
// where it fits.
export type PopupPlace =
  { readonly top: number; readonly left: number } | { readonly top: number; readonly right: number }

// Under the element, flush with its left edge; past the middle of the window, flush with its right
// edge, so that it stays in the window.
const GAP = 2
const HALF = 2

export function popupPlace(anchor: DOMRect, windowWidth: number): PopupPlace {
  const top = anchor.bottom + GAP
  return anchor.left > windowWidth / HALF
    ? { top, right: windowWidth - anchor.right }
    : { top, left: anchor.left }
}

// The place under an element of the page, as the window lays it out now; the top left corner of the
// window when the element is gone (its column scrolled out of the page).
export function placeUnder(element: Element | null): PopupPlace {
  return element === null
    ? { top: 0, left: 0 }
    : popupPlace(element.getBoundingClientRect(), window.innerWidth)
}

// A press of the mouse outside the element dismisses what it holds (a menu, a popover).
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }
    const onPress = (event: MouseEvent): void => {
      if (!(event.target instanceof Node && ref.current?.contains(event.target) === true)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', onPress)
    return () => {
      document.removeEventListener('mousedown', onPress)
    }
  }, [ref, isOpen, onDismiss])
}
