import { type ReactElement, useRef } from 'react'

import type { CellPosition } from '../core/grid/selection.ts'
import type { PeekMessage, ResultTab } from '../core/results/protocol.ts'
import type { PeekView } from '../core/results/tab-meta.ts'
import { displayCell } from './cell-display.ts'
import { pairs } from './grid-model.ts'
import type { LinkActions } from './link-actions.ts'
import { type PopupPlace, useDismiss } from './popup.ts'
import { TextButton } from './tool-buttons.tsx'

interface PeekPopupProps {
  readonly tab: ResultTab
  readonly position: CellPosition
  readonly peek: PeekMessage | undefined
  readonly links: LinkActions
  readonly place: PopupPlace
  readonly onClose: () => void
}

// The row a link points at, a few of its columns, without leaving the grid: it loads when asked,
// and opens from here too.
export const PeekPopup = (props: PeekPopupProps): ReactElement => {
  const boxRef = useRef<HTMLDivElement>(null)
  useDismiss(boxRef, true, props.onClose)
  const view = peekOf(props)
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Referenced row"
      className="popover peek"
      style={props.place}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          props.onClose()
        }
      }}
    >
      {view === undefined ? <p className="popover-text">Loading…</p> : <PeekBody view={view} />}
      <PeekActions props={props} />
    </div>
  )
}

// What the host said of this cell of this view; undefined until it answers.
function peekOf({ tab, position, peek }: PeekPopupProps): PeekView | undefined {
  const isOfTab = peek?.tabId === tab.id && peek.viewVersion === tab.viewVersion
  return isOfTab && isSameCell(peek, position) ? peek.peek : undefined
}

function isSameCell(peek: PeekMessage, position: CellPosition): boolean {
  return peek.row === position.row && peek.column === position.column
}

const PeekBody = ({ view }: { readonly view: PeekView }): ReactElement => (
  <>
    {view.title === '' ? null : <p className="popover-title">{view.title}</p>}
    {view.problem === '' ? (
      <dl className="peek-values">
        {pairs(view.columns, view.values).map(([column, value]) => (
          <PeekValue key={column} column={column} value={value} />
        ))}
      </dl>
    ) : (
      <p className="popover-text">{view.problem}</p>
    )}
  </>
)

const PeekValue = ({
  column,
  value,
}: {
  readonly column: string
  readonly value: PeekView['values'][number]
}): ReactElement => {
  const display = displayCell(value, typeof value === 'number' ? 'number' : 'text')
  return (
    <>
      <dt>{column}</dt>
      <dd className={`look-${display.look}`}>{display.text}</dd>
    </>
  )
}

const PeekActions = ({ props }: { readonly props: PeekPopupProps }): ReactElement => {
  const open = (isInPlace: boolean) => () => {
    props.onClose()
    props.links.open(props.position, isInPlace)
  }
  return (
    <span className="popover-actions">
      <TextButton label="Open" title="Open the row (Ctrl+click)" onClick={open(false)} />
      {props.links.canOpenInPlace ? (
        <TextButton label="Open Here" title="Open the row here (Alt+click)" onClick={open(true)} />
      ) : null}
    </span>
  )
}
