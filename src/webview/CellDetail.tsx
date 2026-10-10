import type { ReactElement } from 'react'

import type { CellValue, ResultColumn } from '../core/engine/query.ts'
import { detailText } from './cell-display.ts'

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
    <pre tabIndex={0}>{value === undefined ? 'Loading…' : detailText(value, column.kind)}</pre>
  </aside>
)
