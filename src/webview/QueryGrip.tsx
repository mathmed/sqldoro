import type { KeyboardEvent, MouseEvent, ReactElement } from 'react'

import { BOX_LINE_HEIGHT, MIN_BOX_HEIGHT } from '../core/grid/query-mode.ts'
import type { BoxSize } from './use-query-box.ts'

// The lower edge of the box: dragged, or moved a line at a time with the arrow keys.
export const QueryGrip = ({ size }: { readonly size: BoxSize }): ReactElement => (
  <div
    className="query-grip"
    role="separator"
    aria-orientation="horizontal"
    aria-label="Height of the query box"
    aria-valuenow={size.height}
    aria-valuemin={MIN_BOX_HEIGHT}
    tabIndex={0}
    title="Drag to resize the query box"
    onMouseDown={(event) => {
      startDrag(event, size)
    }}
    onKeyDown={(event) => {
      onGripKey(event, size)
    }}
  />
)

const GRIP_STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowUp', -BOX_LINE_HEIGHT],
  ['ArrowDown', BOX_LINE_HEIGHT],
])

function onGripKey(event: KeyboardEvent<HTMLDivElement>, size: BoxSize): void {
  const step = GRIP_STEPS.get(event.key)
  if (step !== undefined) {
    event.preventDefault()
    size.keep(size.height + step)
  }
}

// The box follows the pointer until it is let go, wherever it goes in the window.
function startDrag(event: MouseEvent<HTMLDivElement>, size: BoxSize): void {
  event.preventDefault()
  const heightAt = (y: number): number => size.height + y - event.clientY
  const onMove = (move: globalThis.MouseEvent): void => {
    size.resize(heightAt(move.clientY))
  }
  const onUp = (up: globalThis.MouseEvent): void => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    size.keep(heightAt(up.clientY))
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
