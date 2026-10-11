import { useState } from 'react'

import {
  type WhereCompletion,
  whereCompletion,
  type WhereSource,
  WhereSuggestionKind,
} from '../core/completion/where-completion.ts'

// The suggestions shown under the WHERE, and the one Enter or Tab would take.
export interface Suggesting {
  readonly completion: WhereCompletion
  readonly active: number
}

// The text once a suggestion took the place of what was being typed, and where the caret goes.
export interface Accepted {
  readonly text: string
  readonly cursor: number
}

export interface WhereCompleter {
  readonly list: Suggesting | undefined
  // What is typed changed, or Ctrl+Space asked for the suggestions.
  readonly update: (text: string, cursor: number, isAsked: boolean) => void
  readonly close: () => void
  // Shows these suggestions, one of them active.
  readonly show: (list: Suggesting) => void
}

// Values of an enum and operators come as soon as they fit; names and keywords once a word is begun.
const OFFERED: ReadonlySet<string> = new Set([
  WhereSuggestionKind.Value,
  WhereSuggestionKind.Operator,
])

export function useWhereCompletion(source: WhereSource): WhereCompleter {
  const [list, setList] = useState<Suggesting>()
  const close = (): void => {
    setList(undefined)
  }
  return {
    list,
    update: (text, cursor, isAsked) => {
      const completion = whereCompletion(text, cursor, source)
      setList(
        completion !== undefined && shouldOffer(completion, isAsked)
          ? { completion, active: 0 }
          : undefined,
      )
    },
    close,
    show: setList,
  }
}

function shouldOffer(completion: WhereCompletion, isAsked: boolean): boolean {
  const first = completion.suggestions.at(0)
  if (first === undefined) {
    return false
  }
  return isAsked || completion.from < completion.to || OFFERED.has(first.kind)
}

// The text with the suggestion at this place of the list instead of what was being typed: one
// text, or none past the end of the list.
export function withSuggestion(
  text: string,
  completion: WhereCompletion,
  index: number,
): Accepted[] {
  return completion.suggestions.slice(index, index + 1).map((suggestion) => {
    const before = text.slice(0, completion.from) + suggestion.insertText
    return { text: before + text.slice(completion.to), cursor: before.length }
  })
}

// The suggestions with the active one this many places on, round the ends.
export function moved(list: Suggesting, step: number): Suggesting {
  const count = list.completion.suggestions.length
  return { ...list, active: (list.active + step + count) % count }
}
