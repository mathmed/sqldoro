import { type CSSProperties, type ReactElement, type RefObject, useEffect } from 'react'

import { BOX_LINE_HEIGHT } from '../core/grid/query-mode.ts'
import { SqlSpans } from './SqlSpans.tsx'
import type { QueryBoxView } from './use-query-box.ts'
import { type FieldKeys, type FieldScroll, type SqlField, useSqlField } from './use-sql-field.ts'
import type { Accepted, WhereCompleter } from './use-where-completion.ts'
import type { WhereSql } from './where-source.ts'
import { WhereSuggestions } from './WhereSuggestions.tsx'

const LIST_ID = 'query-suggestions'
const INDENT = '  '
// Where the text starts in the box, in pixels: the stylesheet pads the field the same.
const TEXT_TOP = 4
const TEXT_LEFT = 8
const PLACEHOLDER = 'SELECT … — Ctrl+Enter runs the query, Ctrl+Space suggests'

interface QueryFieldProps {
  readonly view: QueryBoxView
  readonly sql: WhereSql
  readonly fieldRef: RefObject<HTMLTextAreaElement | null>
  readonly onRun: () => void
}

// The text area over its colored copy, as the WHERE: the text of the field is transparent. It takes
// the focus when the box opens.
export const QueryField = ({ view, sql, fieldRef, onRun }: QueryFieldProps): ReactElement => {
  const field = useSqlField(fieldRef, { source: sql.source, onChange: view.edit })
  useFocusOnOpen(fieldRef)
  return (
    <div
      className={view.size.isResizing ? 'query-field is-resizing' : 'query-field'}
      style={{ height: `${String(view.size.height)}px` }}
    >
      <pre className="query-highlight" aria-hidden="true">
        <code style={scrolled(field.scroll)}>
          <SqlSpans text={view.text} sql={sql} />
        </code>
      </pre>
      <textarea
        ref={fieldRef}
        {...inputAttributes(field)}
        value={view.text}
        {...field.handlers(boxKeys(onRun, field))}
      />
      <WhereSuggestions
        id={LIST_ID}
        completer={field.completer}
        onTake={field.take}
        text={view.text}
        place={listPlace(view.text, field)}
      />
    </div>
  )
}

function scrolled({ left, top }: FieldScroll): CSSProperties {
  return { transform: `translate(${String(-left)}px, ${String(-top)}px)` }
}

// A text box that offers suggestions, as screen readers know it.
function inputAttributes({ completer }: SqlField<HTMLTextAreaElement>): Record<string, unknown> {
  const { list } = completer
  return {
    className: 'query-input',
    'aria-label': 'Query',
    'aria-autocomplete': 'list',
    'aria-controls': LIST_ID,
    'aria-activedescendant': list === undefined ? undefined : `${LIST_ID}-${String(list.active)}`,
    placeholder: PLACEHOLDER,
    spellCheck: false,
    wrap: 'off',
  }
}

// Ctrl+Enter (Cmd+Enter) runs, whatever is suggested (the suggestions go); Tab indents where
// nothing is.
function boxKeys(
  onRun: () => void,
  { completer, take }: Pick<SqlField<HTMLTextAreaElement>, 'completer' | 'take'>,
): FieldKeys<HTMLTextAreaElement> {
  return {
    first: (event) => {
      const isRun = event.key === 'Enter' && (event.ctrlKey || event.metaKey)
      if (isRun) {
        completer.close()
        onRun()
      }
      return isRun
    },
    last: (event) => {
      const isIndent = event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey
      if (isIndent) {
        take(indented(event.currentTarget))
      }
      return isIndent
    },
  }
}

function indented(field: HTMLTextAreaElement): Accepted {
  const { value, selectionStart, selectionEnd } = field
  const text = value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd)
  return { text, cursor: selectionStart + INDENT.length }
}

// Under the word being completed, where it is in the text (the font of the box is monospaced).
function listPlace(
  text: string,
  { completer, scroll }: { readonly completer: WhereCompleter; readonly scroll: FieldScroll },
): CSSProperties | undefined {
  const from = completer.list?.completion.from
  if (from === undefined) {
    return undefined
  }
  const before = text.slice(0, from)
  const line = before.split('\n').length
  const column = from - (before.lastIndexOf('\n') + 1)
  return {
    top: `${String(TEXT_TOP + line * BOX_LINE_HEIGHT - scroll.top)}px`,
    left: `calc(${String(column)}ch + ${String(TEXT_LEFT - scroll.left)}px)`,
  }
}

function useFocusOnOpen(fieldRef: RefObject<HTMLTextAreaElement | null>): void {
  useEffect(() => {
    fieldRef.current?.focus()
  }, [fieldRef])
}
