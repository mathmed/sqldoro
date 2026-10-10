import { type ReactElement, useState } from 'react'

import { type ResultTab, TabStatus } from '../core/results/protocol.ts'
import { Icon, IconName } from './icons.tsx'

interface WhereFilterProps {
  readonly tab: ResultTab
  readonly onFilter: (condition: string) => void
}

const PLACEHOLDER = "SQL filter (e.g. status = 'active')"
const TOOLTIP =
  'A condition in SQL: the table is read again with it as its WHERE, through the safety guards. Enter applies it; an empty one reads every row.'

// The WHERE of a table panel: a condition in the SQL of the database, which the host reads the
// table with. Enter applies it; the clear button (or an empty condition) reads every row again.
export const WhereFilter = ({ tab, onFilter }: WhereFilterProps): ReactElement => {
  const { draft, setDraft, apply } = useWhereDraft(tab, onFilter)
  const isRunning = tab.status === TabStatus.Running
  return (
    <span className="where-filter">
      <label className="where-label" htmlFor={`where-${tab.id}`}>
        WHERE
      </label>
      <WhereInput
        id={`where-${tab.id}`}
        draft={draft}
        isDisabled={isRunning}
        onChange={setDraft}
        onApply={apply}
      />
      {draft === '' && tab.tableFilter === '' ? null : (
        <ClearButton
          isDisabled={isRunning}
          onClear={() => {
            apply('')
          }}
        />
      )}
    </span>
  )
}

interface WhereDraft {
  readonly draft: string
  readonly setDraft: (draft: string) => void
  readonly apply: (condition: string) => void
}

// What is typed, applied only when it is another condition than the one the rows were read with.
function useWhereDraft(tab: ResultTab, onFilter: (condition: string) => void): WhereDraft {
  const [draft, setDraft] = useState(tab.tableFilter)
  const apply = (condition: string): void => {
    setDraft(condition)
    if (condition.trim() !== tab.tableFilter) {
      onFilter(condition)
    }
  }
  return { draft, setDraft, apply }
}

const ClearButton = ({
  isDisabled,
  onClear,
}: {
  readonly isDisabled: boolean
  readonly onClear: () => void
}): ReactElement => (
  <button
    type="button"
    className="tool-button"
    aria-label="Clear the WHERE condition"
    title="Clear the WHERE condition and read every row"
    disabled={isDisabled}
    onClick={onClear}
  >
    <Icon name={IconName.Close} />
  </button>
)

interface WhereInputProps {
  readonly id: string
  readonly draft: string
  readonly isDisabled: boolean
  readonly onChange: (draft: string) => void
  readonly onApply: (condition: string) => void
}

const WhereInput = ({
  id,
  draft,
  isDisabled,
  onChange,
  onApply,
}: WhereInputProps): ReactElement => (
  <input
    id={id}
    type="text"
    aria-label="WHERE condition"
    placeholder={PLACEHOLDER}
    title={TOOLTIP}
    spellCheck={false}
    value={draft}
    disabled={isDisabled}
    onChange={(event) => {
      onChange(event.target.value)
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        onApply(draft)
      }
    }}
  />
)
