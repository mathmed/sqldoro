import { type ReactElement, useRef } from 'react'

import type { ReferenceCountsMessage, ResultTab } from '../core/results/protocol.ts'
import { groupDigits } from '../core/results/tabs.ts'
import type { LinkActions } from './link-actions.ts'
import { type PopupPlace, useDismiss } from './popup.ts'
import { TextButton } from './tool-buttons.tsx'

interface ReferencesPanelProps {
  readonly tab: ResultTab
  readonly row: number
  readonly counts: ReferenceCountsMessage | undefined
  readonly links: LinkActions
  readonly place: PopupPlace
  readonly onClose: () => void
}

// The tables whose foreign keys point at the rows of a result (it opens only where some do): each
// opens the rows that reference the row, and how many there are is counted on the server when
// asked.
export const ReferencesPanel = (props: ReferencesPanelProps): ReactElement => {
  const { row } = props
  const boxRef = useRef<HTMLDivElement>(null)
  useDismiss(boxRef, true, props.onClose)
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={`References of row ${String(row + 1)}`}
      className="popover references-panel"
      style={props.place}
    >
      <p className="popover-title">Rows that reference row {row + 1}</p>
      <ReferenceList props={props} />
      <span className="popover-actions">
        <TextButton
          label="Count Rows"
          onClick={() => {
            props.links.countReferences(row)
          }}
        />
      </span>
    </div>
  )
}

// The counts the host gave for this row of this view; none before it answers.
function countsOf({ tab, row, counts }: ReferencesPanelProps): readonly (string | null)[] {
  const isAnswer =
    counts?.tabId === tab.id && counts.viewVersion === tab.viewVersion && counts.row === row
  return isAnswer ? counts.counts : []
}

const ReferenceList = ({ props }: { readonly props: ReferencesPanelProps }): ReactElement => {
  const counts = countsOf(props)
  return (
    <ul className="references-list">
      {props.tab.references.map((reference, index) => (
        <li key={reference.label}>
          <span className="reference-label">{reference.label}</span>
          <span className="reference-count">{countText(counts, index)}</span>
          <OpenButtons props={props} reference={index} />
        </li>
      ))}
    </ul>
  )
}

function countText(counts: readonly (string | null)[], index: number): string {
  if (counts.length === 0) {
    return ''
  }
  const count = counts.at(index) ?? null
  return count === null ? '?' : `${groupDigits(BigInt(count))} rows`
}

interface OpenButtonsProps {
  readonly props: ReferencesPanelProps
  readonly reference: number
}

const OpenButtons = ({ props, reference }: OpenButtonsProps): ReactElement => {
  const open = (isInPlace: boolean) => () => {
    props.onClose()
    props.links.openReference(props.row, reference, isInPlace)
  }
  return (
    <span className="reference-actions">
      <TextButton label="Open" onClick={open(false)} />
      {props.links.canOpenInPlace ? (
        <TextButton label="Here" title="Open here (Alt+click)" onClick={open(true)} />
      ) : null}
    </span>
  )
}
