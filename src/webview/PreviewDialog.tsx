import { type KeyboardEvent, type ReactElement, useEffect, useRef } from 'react'

import type { PanelConnection } from '../core/results/protocol.ts'
import type { EditPreview, PreviewStatement } from '../core/results/tab-editing.ts'
import { plural } from '../core/results/tabs.ts'
import { ConnectionBanner } from './ConnectionBanner.tsx'

interface PreviewDialogProps {
  readonly preview: EditPreview
  // Where they run, production standing out, right where the user confirms.
  readonly connection: PanelConnection | null
  readonly onApply: (previewId: number) => void
  readonly onClose: () => void
}

const OWN_TRANSACTION = 'They run in one transaction: all of them apply, or none.'
const OPEN_TRANSACTION =
  'They run in the open transaction of this editor, inside a savepoint: commit the transaction to keep them.'

// The statements the changes become, exactly as they will run, with their bound values and the rows
// each must change: nothing reaches the server before the user applies them here.
export const PreviewDialog = ({
  preview,
  connection,
  onApply,
  onClose,
}: PreviewDialogProps): ReactElement => {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }
  return (
    <div className="preview-backdrop">
      <section
        className="preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        onKeyDown={onKeyDown}
      >
        {connection === null ? null : <ConnectionBanner connection={connection} />}
        <PreviewBody preview={preview} />
        <PreviewButtons preview={preview} onApply={onApply} onClose={onClose} />
      </section>
    </div>
  )
}

const PreviewBody = ({ preview }: { readonly preview: EditPreview }): ReactElement => (
  <>
    <h2 id="preview-title">Apply {preview.summary}?</h2>
    <p>{preview.isInOpenTransaction ? OPEN_TRANSACTION : OWN_TRANSACTION}</p>
    {preview.deletions === 0 ? null : (
      <p className="preview-warning">
        {`They delete ${plural(preview.deletions, 'row', 'rows')}: you confirm how many before they run.`}
      </p>
    )}
    <ol className="preview-statements" aria-label="Statements">
      {preview.statements.map((statement) => (
        <StatementItem key={statement.label} statement={statement} />
      ))}
    </ol>
  </>
)

// Cancel has the focus: applying is a deliberate act.
const PreviewButtons = ({
  preview,
  onApply,
  onClose,
}: Omit<PreviewDialogProps, 'connection'>): ReactElement => {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])
  return (
    <footer>
      <button ref={cancelRef} type="button" onClick={onClose}>
        Cancel
      </button>
      <button
        type="button"
        className="primary"
        onClick={() => {
          onApply(preview.id)
        }}
      >
        {`Apply ${plural(preview.statements.length, 'Statement', 'Statements')}`}
      </button>
    </footer>
  )
}

const StatementItem = ({ statement }: { readonly statement: PreviewStatement }): ReactElement => (
  <li>
    <span className="preview-label">
      {`${statement.label} · must change ${plural(statement.expectedRows, 'row', 'rows')}`}
    </span>
    <pre>{statement.sql}</pre>
    {statement.values.length === 0 ? null : (
      <span className="preview-values">{`Values, in order: ${statement.values.join(', ')}`}</span>
    )}
  </li>
)
