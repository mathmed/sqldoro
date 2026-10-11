import { type KeyboardEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import {
  type SearchHostMessage,
  SearchHostMessageType,
  SearchViewMessageType,
} from '../../core/table-search/protocol.ts'
import { IDLE_STATUS, type SearchStatus } from '../../core/table-search/status.ts'
import { listenToHost } from '../host.ts'
import { SEARCH_CHANNEL, type SearchApi } from './search-api.ts'

export type InputRef = RefObject<HTMLInputElement | null>

export interface TableSearch {
  readonly text: string
  readonly status: SearchStatus
  // Every keystroke: the explorer follows at once.
  readonly type: (text: string) => void
  readonly clear: () => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  readonly onFocus: () => void
}

type KeyRequest = typeof SearchViewMessageType.FocusTree | typeof SearchViewMessageType.OpenBest

// The keys of the box: Enter opens the table that matches best, the down arrow moves to it in the
// explorer, Escape clears the text.
const KEY_REQUESTS: ReadonlyMap<string, KeyRequest> = new Map<string, KeyRequest>([
  ['Enter', SearchViewMessageType.OpenBest],
  ['ArrowDown', SearchViewMessageType.FocusTree],
])
const ESCAPE = 'Escape'

// Sends every keystroke to the host, which filters the explorer, and shows where the search stands
// as the host says. The text the host sends (when the box loads again, or the filter is cleared
// elsewhere) replaces what the box holds.
// The box and the input it puts the focus in.
export interface SearchBox {
  readonly search: TableSearch
  readonly inputRef: InputRef
}

export function useTableSearch(api: SearchApi): SearchBox {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<SearchStatus>(IDLE_STATUS)
  const inputRef = useRef<HTMLInputElement>(null)
  useHost(api, { setText, setStatus, inputRef })
  useFocusFollowsView(inputRef)
  const type = useCallback(
    (next: string): void => {
      setText(next)
      api.postMessage({ type: SearchViewMessageType.Search, text: next })
    },
    [api],
  )
  const actions = useBoxActions(api, { text, type, inputRef })
  return { search: { text, status, type, ...actions }, inputRef }
}

// Listens to the host, then tells it the box is ready.
function useHost(api: SearchApi, receiver: Receiver): void {
  const { setText, setStatus, inputRef } = receiver
  useEffect(
    () =>
      listenToHost(api, SEARCH_CHANNEL, (message) => {
        receive(message, { setText, setStatus, inputRef })
      }),
    [api, setText, setStatus, inputRef],
  )
  useEffect(() => {
    api.postMessage({ type: SearchViewMessageType.Ready })
  }, [api])
}

interface Box {
  readonly text: string
  readonly type: (text: string) => void
  readonly inputRef: InputRef
}

function useBoxActions(
  api: SearchApi,
  { text, type, inputRef }: Box,
): Pick<TableSearch, 'clear' | 'onFocus' | 'onKeyDown'> {
  const clear = useCallback((): void => {
    if (text !== '') {
      type('')
    }
    inputRef.current?.focus()
  }, [text, type, inputRef])
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      pressed(event, { api, clear })
    },
    [api, clear],
  )
  const onFocus = useCallback((): void => {
    api.postMessage({ type: SearchViewMessageType.Focused })
  }, [api])
  return { clear, onKeyDown, onFocus }
}

interface Receiver {
  readonly setText: (text: string) => void
  readonly setStatus: (status: SearchStatus) => void
  readonly inputRef: InputRef
}

function receive(message: SearchHostMessage, { setText, setStatus, inputRef }: Receiver): void {
  if (message.type === SearchHostMessageType.Status) {
    setStatus(message.status)
  } else if (message.type === SearchHostMessageType.SetText) {
    setText(message.text)
  } else {
    inputRef.current?.focus()
    inputRef.current?.select()
  }
}

function pressed(
  event: KeyboardEvent<HTMLInputElement>,
  { api, clear }: { readonly api: SearchApi; readonly clear: () => void },
): void {
  const request = KEY_REQUESTS.get(event.key)
  if (request !== undefined) {
    event.preventDefault()
    api.postMessage({ type: request })
  } else if (event.key === ESCAPE) {
    clear()
  }
}

// VS Code focuses the webview, not what is in it: the box takes the focus the view gets.
function useFocusFollowsView(inputRef: InputRef): void {
  useEffect(() => {
    const focus = (): void => {
      inputRef.current?.focus()
    }
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener('focus', focus)
    }
  }, [inputRef])
}
