// Stands in for the API VS Code gives a webview (acquireVsCodeApi): the messages the webview posts
// are recorded, and the host's messages are played as the window events VS Code would send.
import { act } from '@testing-library/react'
import { vi } from 'vitest'

import type { HostMessage, WebviewMessage } from '../../src/core/results/protocol.ts'

export interface FakeVsCodeApi {
  readonly postMessage: ReturnType<typeof vi.fn<(message: WebviewMessage) => void>>
  readonly getState: () => unknown
  readonly setState: (state: unknown) => void
  readonly posted: () => WebviewMessage[]
}

export function fakeVsCodeApi(): FakeVsCodeApi {
  let state: unknown
  const postMessage = vi.fn<(message: WebviewMessage) => void>()
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
export function fromHost(message: HostMessage | object): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message }))
  })
}
