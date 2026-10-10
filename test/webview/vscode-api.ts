// Stands in for the API VS Code gives a webview (acquireVsCodeApi): the messages the webview posts
// are recorded, and the host's messages are played as the window events VS Code would send.
import { act } from '@testing-library/react'
import { vi } from 'vitest'

import type { WebviewMessage } from '../../src/core/results/protocol.ts'

// M is what the view posts: the result view's messages unless told otherwise.
export interface FakeVsCodeApi<M = WebviewMessage> {
  readonly postMessage: ReturnType<typeof vi.fn<(message: M) => void>>
  readonly getState: () => unknown
  readonly setState: (state: unknown) => void
  readonly posted: () => M[]
}

export function fakeVsCodeApi<M = WebviewMessage>(): FakeVsCodeApi<M> {
  let state: unknown
  const postMessage = vi.fn<(message: M) => void>()
  return {
    postMessage,
    getState: () => state,
    setState: (next) => {
      state = next
    },
    posted: () => postMessage.mock.calls.map(([message]) => message),
  }
}

// Plays a message from the extension host, as VS Code delivers it to the webview's window.
export function fromHost(message: object): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message }))
  })
}
