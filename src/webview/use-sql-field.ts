import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import type { WhereSource } from '../core/completion/where-completion.ts'
import {
  type Accepted,
  moved,
  type Suggesting,
  useWhereCompletion,
  type WhereCompleter,
  withSuggestion,
} from './use-where-completion.ts'

// The fields of SQL of a table panel: the one line of its WHERE, the lines of its query box.
type FieldElement = HTMLInputElement | HTMLTextAreaElement

// How far the text of a field is scrolled, for its colored copy to follow.
export interface FieldScroll {
  readonly left: number
  readonly top: number
}

export interface SqlField<T extends FieldElement> {
  readonly scroll: FieldScroll
  readonly completer: WhereCompleter
  readonly take: (taken: Accepted) => void
  readonly handlers: (keys: FieldKeys<T>) => FieldHandlers<T>
}

// The keys a field handles itself: before its suggestions see them (the query box runs on
// Ctrl+Enter whatever is suggested) and once they did not take them (Enter applies the WHERE).
export interface FieldKeys<T extends FieldElement> {
  readonly first: (event: KeyboardEvent<T>) => boolean
  readonly last: (event: KeyboardEvent<T>) => boolean
}

interface FieldHandlers<T extends FieldElement> {
  readonly onChange: (event: ChangeEvent<T>) => void
  readonly onBlur: () => void
  readonly onScroll: (event: SyntheticEvent<T>) => void
  readonly onSelect: (event: SyntheticEvent<T>) => void
  readonly onKeyDown: (event: KeyboardEvent<T>) => void
}

const NO_SCROLL: FieldScroll = { left: 0, top: 0 }

// What a field of SQL does as it is typed in: its suggestions, the caret after one is taken, its
// colored copy following its scroll.
export function useSqlField<T extends FieldElement>(
  fieldRef: RefObject<T | null>,
  { source, onChange }: { readonly source: WhereSource; readonly onChange: (text: string) => void },
): SqlField<T> {
  const [scroll, setScroll] = useState(NO_SCROLL)
  const completer = useWhereCompletion(source)
  const place = useCaret(fieldRef)
  const take = (taken: Accepted): void => {
    onChange(taken.text)
    place(taken.cursor)
  }
  const follow = (event: SyntheticEvent<T>): void => {
    const { scrollLeft, scrollTop } = event.currentTarget
    setScroll({ left: scrollLeft, top: scrollTop })
  }
  return {
    scroll,
    completer,
    take,
    handlers: (keys) => fieldHandlers({ completer, take, keys, onChange, follow }),
  }
}

interface HandlerSources<T extends FieldElement> extends SqlKeys<T> {
  readonly onChange: (text: string) => void
  readonly follow: (event: SyntheticEvent<T>) => void
}

function fieldHandlers<T extends FieldElement>(sources: HandlerSources<T>): FieldHandlers<T> {
  const { completer, follow } = sources
  return {
    onChange: (event) => {
      sources.onChange(event.target.value)
      completer.update(event.target.value, Number(event.target.selectionStart), false)
    },
    onBlur: completer.close,
    onScroll: follow,
    onSelect: follow,
    onKeyDown: (event) => {
      onSqlKey(event, sources)
    },
  }
}

// Moves the caret once the text it belongs to is in the field.
function useCaret(fieldRef: RefObject<FieldElement | null>): (cursor: number) => void {
  const caretRef = useRef<number>(undefined)
  useLayoutEffect(() => {
    const cursor = caretRef.current
    if (cursor !== undefined) {
      caretRef.current = undefined
      fieldRef.current?.setSelectionRange(cursor, cursor)
    }
  })
  return (cursor) => {
    caretRef.current = cursor
  }
}

interface SqlKeys<T extends FieldElement> {
  readonly completer: WhereCompleter
  readonly take: (accepted: Accepted) => void
  readonly keys: FieldKeys<T>
}

const LIST_STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowDown', 1],
  ['ArrowUp', -1],
])

// With suggestions shown, the arrows move along them, Enter or Tab takes one and Escape hides them.
// Ctrl+Space asks for suggestions; the field has the other keys.
function onSqlKey<T extends FieldElement>(event: KeyboardEvent<T>, keys: SqlKeys<T>): void {
  const { list } = keys.completer
  const isHandled =
    keys.keys.first(event) ||
    (list === undefined ? onFieldKey(event, keys) : onListKey(event, { ...keys, list }))
  if (isHandled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function onListKey<T extends FieldElement>(
  event: KeyboardEvent<T>,
  keys: SqlKeys<T> & { readonly list: Suggesting },
): boolean {
  const step = LIST_STEPS.get(event.key)
  if (step !== undefined) {
    keys.completer.show(moved(keys.list, step))
    return true
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    keys.completer.close()
    withSuggestion(event.currentTarget.value, keys.list.completion, keys.list.active).forEach(
      keys.take,
    )
    return true
  }
  return onFieldKey(event, keys)
}

function onFieldKey<T extends FieldElement>(event: KeyboardEvent<T>, keys: SqlKeys<T>): boolean {
  const field = event.currentTarget
  if (event.key === 'Escape') {
    keys.completer.close()
    return keys.completer.list !== undefined
  }
  if (event.ctrlKey && event.code === 'Space') {
    keys.completer.update(field.value, Number(field.selectionStart), true)
    return true
  }
  return keys.keys.last(event)
}
