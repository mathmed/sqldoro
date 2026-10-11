import { type RefObject, type UIEvent, useEffect, useRef, useState } from 'react'

// Where the grid of each step of the trail of a table panel was scrolled to, by step: going back to
// a step shows its rows where they were.
export interface GridScroll {
  // The step of the trail the rows belong to; null outside a trail.
  readonly step: number | null
  readonly scrolls: Map<number, number>
}

// The rows of a step arrive after its grid shows: its scroll comes back with the first of them. The
// step is the one shown when the grid came, which its rows belong to.
export function useStepScroll(
  { step, scrolls }: GridScroll,
  scrollRef: RefObject<HTMLDivElement | null>,
  rowCount: number,
): (event: UIEvent<HTMLDivElement>) => void {
  const [ownStep] = useState(step)
  const isRestoredRef = useRef(false)
  useEffect(() => {
    if (isRestoredRef.current || rowCount === 0) {
      return
    }
    isRestoredRef.current = true
    restore(scrollRef.current, ownStep === null ? undefined : scrolls.get(ownStep))
  }, [rowCount, ownStep, scrolls, scrollRef])
  return (event) => {
    if (ownStep !== null) {
      scrolls.set(ownStep, event.currentTarget.scrollTop)
    }
  }
}

function restore(element: HTMLElement | null, top: number | undefined): void {
  if (element !== null && top !== undefined) {
    element.scrollTo({ top })
  }
}
