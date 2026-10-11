import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {
  type Accepted,
  moved,
  type Suggesting,
  useWhereCompletion,
  type WhereCompleter,
  withSuggestion,
} from './use-where-completion.ts'
import type { WhereSql } from './where-source.ts'

export interface WhereField {
  // How far the text of the field is scrolled, for its colored copy to follow.
  readonly scroll: number
  readonly completer: WhereCompleter
  readonly take: (taken: Accepted) => void
  readonly handlers: (onApply: (condition: string) => void) => FieldHandlers
}

interface FieldHandlers {
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void
  readonly onBlur: () => void
  readonly onScroll: (event: SyntheticEvent<HTMLInputElement>) => void
  readonly onSelect: (event: SyntheticEvent<HTMLInputElement>) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

// What the field of the WHERE does as it is typed in: its suggestions, the caret after one is taken,
// its colored copy following its scroll.
export function useWhereField(
  inputRef: RefObject<HTMLInputElement | null>,
  { sql, onChange }: { readonly sql: WhereSql; readonly onChange: (draft: string) => void },
): WhereField {
  const [scroll, setScroll] = useState(0)
  const completer = useWhereCompletion(sql.source)
  const place = useCaret(inputRef)
  const take = (taken: Accepted): void => {
    onChange(taken.text)
    place(taken.cursor)
  }
  const follow = (event: SyntheticEvent<HTMLInputElement>): void => {
    setScroll(event.currentTarget.scrollLeft)
  }
  return {
    scroll,
    completer,
    take,
    handlers: (onApply) => fieldHandlers({ completer, take, onApply, onChange, follow }),
  }
}

interface HandlerSources extends WhereKeys {
  readonly onChange: (draft: string) => void
  readonly follow: (event: SyntheticEvent<HTMLInputElement>) => void
}

function fieldHandlers(sources: HandlerSources): FieldHandlers {
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
      onWhereKey(event, sources)
    },
  }
}

// Moves the caret once the text it belongs to is in the field.
function useCaret(inputRef: RefObject<HTMLInputElement | null>): (cursor: number) => void {
  const caretRef = useRef<number>(undefined)
  useLayoutEffect(() => {
    const cursor = caretRef.current
    if (cursor !== undefined) {
      caretRef.current = undefined
      inputRef.current?.setSelectionRange(cursor, cursor)
    }
  })
  return (cursor) => {
    caretRef.current = cursor
  }
}

interface WhereKeys {
  readonly completer: WhereCompleter
  readonly take: (accepted: Accepted) => void
  readonly onApply: (condition: string) => void
}

const LIST_STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowDown', 1],
  ['ArrowUp', -1],
])

// With suggestions shown, the arrows move along them, Enter or Tab takes one and Escape hides them.
// Otherwise Enter applies the condition and Ctrl+Space asks for suggestions.
function onWhereKey(event: KeyboardEvent<HTMLInputElement>, keys: WhereKeys): void {
  const { list } = keys.completer
  const isHandled =
    list === undefined ? onFieldKey(event, keys) : onListKey(event, { ...keys, list })
  if (isHandled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function onListKey(
  event: KeyboardEvent<HTMLInputElement>,
  keys: WhereKeys & { readonly list: Suggesting },
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

function onFieldKey(event: KeyboardEvent<HTMLInputElement>, keys: WhereKeys): boolean {
  const input = event.currentTarget
  if (event.key === 'Escape') {
    keys.completer.close()
    return keys.completer.list !== undefined
  }
  if (event.key === 'Enter') {
    keys.onApply(input.value)
    return true
  }
  if (event.ctrlKey && event.code === 'Space') {
    keys.completer.update(input.value, Number(input.selectionStart), true)
    return true
  }
  return false
}
