import type { ReactElement } from 'react'

import type { CellValue, ResultColumn } from '../core/engine/query.ts'
import { groupDigits } from '../core/results/tabs.ts'
import { detailView, MAX_DETAIL_LENGTH } from './cell-display.ts'

interface CellDetailProps {
  readonly column: ResultColumn
  // Undefined while the whole value is on its way from the extension.
  readonly value: CellValue | undefined
  readonly onClose: () => void
}

// The whole value of a cell: long text, indented JSON, or a hex dump of binary data.
export const CellDetail = ({ column, value, onClose }: CellDetailProps): ReactElement => (
  <aside className="cell-detail" aria-label={`Value of ${column.name}`}>
    <header>
      <span className="detail-title">{`${column.name} · ${column.dataType}`}</span>
      <button type="button" onClick={onClose} aria-label="Close the value">
        Close
      </button>
    </header>
    {value === undefined ? (
      <pre tabIndex={0}>Loading…</pre>
    ) : (
      <DetailValue column={column} value={value} />
    )}
  </aside>
)

const DetailValue = ({
  column,
  value,
}: {
  readonly column: ResultColumn
  readonly value: CellValue
}): ReactElement => {
  const { text, wholeLength } = detailView(value, column.kind)
  return (
    <>
      {wholeLength === null ? null : (
        <p className="detail-note" role="note">
          {`Showing the first ${groupDigits(MAX_DETAIL_LENGTH)} of ${groupDigits(wholeLength)} characters: copy the cell (Ctrl+C) or export the result to get all of it.`}
        </p>
      )}
      <pre tabIndex={0}>{text}</pre>
    </>
  )
}
