import type { CSSProperties, ReactElement } from 'react'

import { type WhereSuggestion, WhereSuggestionKind } from '../core/completion/where-completion.ts'
import { type Accepted, type WhereCompleter, withSuggestion } from './use-where-completion.ts'

interface WhereSuggestionsProps {
  readonly id: string
  readonly completer: WhereCompleter
  // The text of the field, which the suggestion picked goes into.
  readonly text: string
  readonly onTake: (accepted: Accepted) => void
  // Where the list goes in its field: under the word being typed in a box of many lines; under the
  // field (undefined) in a field of one line.
  readonly place: CSSProperties | undefined
}

const KIND_LABELS: ReadonlyMap<string, string> = new Map([
  [WhereSuggestionKind.Column, 'column'],
  [WhereSuggestionKind.Table, 'table'],
  [WhereSuggestionKind.Keyword, 'keyword'],
  [WhereSuggestionKind.Operator, 'operator'],
  [WhereSuggestionKind.Value, 'value'],
])

// The suggestions for what is typed in the WHERE, under it; a click takes one, and the field keeps
// the focus.
export const WhereSuggestions = (props: WhereSuggestionsProps): ReactElement | null => {
  const { id, completer, text, onTake } = props
  const { list } = completer
  if (list === undefined) {
    return null
  }
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Suggestions"
      className="where-suggestions"
      style={props.place}
    >
      {list.completion.suggestions.map((suggestion, index) => (
        <SuggestionItem
          key={`${suggestion.kind}:${suggestion.label}`}
          id={`${id}-${String(index)}`}
          suggestion={suggestion}
          isActive={index === list.active}
          onPick={() => {
            completer.close()
            withSuggestion(text, list.completion, index).forEach(onTake)
          }}
        />
      ))}
    </ul>
  )
}

interface SuggestionItemProps {
  readonly id: string
  readonly suggestion: WhereSuggestion
  readonly isActive: boolean
  readonly onPick: () => void
}

// A press picks it before the field loses the focus.
const SuggestionItem = ({
  id,
  suggestion,
  isActive,
  onPick,
}: SuggestionItemProps): ReactElement => (
  <li
    id={id}
    role="option"
    aria-selected={isActive}
    className={isActive ? 'suggestion active' : 'suggestion'}
    onMouseDown={(event) => {
      event.preventDefault()
      onPick()
    }}
  >
    <span className="suggestion-label">{suggestion.label}</span>
    <span className="suggestion-kind">{KIND_LABELS.get(suggestion.kind)}</span>
  </li>
)
