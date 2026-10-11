import { type ReactElement, useRef, useState } from 'react'

import { type ResultTab, TabStatus } from '../core/results/protocol.ts'
import { highlightSql } from '../core/sql/highlight.ts'
import { Icon, IconName } from './icons.tsx'
import type { WhereCompleter } from './use-where-completion.ts'
import { useWhereField } from './use-where-field.ts'
import type { WhereSql } from './where-source.ts'
import { WhereSuggestions } from './WhereSuggestions.tsx'

interface WhereEditorProps {
  readonly tab: ResultTab
  readonly sql: WhereSql
  readonly onFilter: (condition: string) => void
  readonly onOpenInEditor: () => void
}

const PLACEHOLDER = "SQL filter (e.g. status = 'active')"
const TOOLTIP =
  'A condition in SQL: the table is read again with it as its WHERE, through the safety guards. Enter applies it, Ctrl+Space suggests columns and values, Ctrl+Shift+E opens the query in an editor; an empty one reads every row.'

// The WHERE of a table panel: a condition in the SQL of the database, colored as it is typed, with
// the columns, operators and values of enums suggested. Enter applies it; the clear button (or an
// empty condition) reads every row again; the expand button opens the whole query in an editor.
export const WhereEditor = (props: WhereEditorProps): ReactElement => {
  const { tab } = props
  const { draft, setDraft, apply } = useWhereDraft(tab, props.onFilter)
  const isRunning = tab.status === TabStatus.Running
  return (
    <span className="where-filter">
      <label className="where-label" htmlFor={`where-${tab.id}`}>
        WHERE
      </label>
      <WhereInput
        props={props}
        draft={{ text: draft, isDisabled: isRunning }}
        onChange={setDraft}
        onApply={apply}
      />
      <WhereButtons
        canClear={draft !== '' || tab.tableFilter !== ''}
        isRunning={isRunning}
        onClear={() => {
          apply('')
        }}
        onOpenInEditor={props.onOpenInEditor}
      />
    </span>
  )
}

interface WhereButtonsProps {
  readonly canClear: boolean
  readonly isRunning: boolean
  readonly onClear: () => void
  readonly onOpenInEditor: () => void
}

const WhereButtons = ({
  canClear,
  isRunning,
  onClear,
  onOpenInEditor,
}: WhereButtonsProps): ReactElement => (
  <>
    {canClear ? (
      <WhereButton
        icon={IconName.Close}
        label="Clear the WHERE condition"
        tooltip="Clear the WHERE condition and read every row"
        isDisabled={isRunning}
        onClick={onClear}
      />
    ) : null}
    <WhereButton
      icon={IconName.Expand}
      label="Open in SQL Editor"
      tooltip="Open the query of this table in an SQL editor (Ctrl+Shift+E)"
      isDisabled={false}
      onClick={onOpenInEditor}
    />
  </>
)

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

interface WhereButtonProps {
  readonly icon: IconName
  readonly label: string
  readonly tooltip: string
  readonly isDisabled: boolean
  readonly onClick: () => void
}

const WhereButton = ({
  icon,
  label,
  tooltip,
  isDisabled,
  onClick,
}: WhereButtonProps): ReactElement => (
  <button
    type="button"
    className="tool-button"
    aria-label={label}
    title={tooltip}
    disabled={isDisabled}
    onClick={onClick}
  >
    <Icon name={icon} />
  </button>
)

interface WhereInputProps {
  readonly props: WhereEditorProps
  readonly draft: { readonly text: string; readonly isDisabled: boolean }
  readonly onChange: (draft: string) => void
  readonly onApply: (condition: string) => void
}

// The field over its colored copy: the text of the field is transparent, the copy shows through.
const WhereInput = ({ props, draft, onChange, onApply }: WhereInputProps): ReactElement => {
  const { tab, sql } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const field = useWhereField(inputRef, { sql, onChange })
  const listId = `where-suggestions-${tab.id}`
  return (
    <span className="where-box">
      <WhereHighlight text={draft.text} sql={sql} scroll={field.scroll} />
      <input
        ref={inputRef}
        id={`where-${tab.id}`}
        {...comboboxAttributes(listId, field.completer)}
        value={draft.text}
        disabled={draft.isDisabled}
        {...field.handlers(onApply)}
      />
      <WhereSuggestions
        id={listId}
        completer={field.completer}
        onTake={field.take}
        text={draft.text}
      />
    </span>
  )
}

// A text field that offers suggestions, as screen readers know it.
function comboboxAttributes(listId: string, { list }: WhereCompleter): Record<string, unknown> {
  return {
    type: 'text',
    role: 'combobox',
    'aria-label': 'WHERE condition',
    'aria-autocomplete': 'list',
    'aria-expanded': list !== undefined,
    'aria-controls': listId,
    'aria-activedescendant': list === undefined ? undefined : `${listId}-${String(list.active)}`,
    className: 'where-input',
    placeholder: PLACEHOLDER,
    title: TOOLTIP,
    spellCheck: false,
  }
}

const WhereHighlight = ({
  text,
  sql,
  scroll,
}: {
  readonly text: string
  readonly sql: WhereSql
  readonly scroll: number
}): ReactElement => (
  <span className="where-highlight" aria-hidden="true">
    <span style={{ transform: `translateX(${String(-scroll)}px)` }}>
      {highlightSql(text, sql.source.dialect.lexical, sql.keywords).map((span, index) => (
        // The parts of the text come in its order, and are drawn anew with it.
        // eslint-disable-next-line @eslint-react/no-array-index-key -- a part has nothing else to be told apart by
        <span key={index} className={`sql-${span.kind}`}>
          {span.text}
        </span>
      ))}
    </span>
  </span>
)
