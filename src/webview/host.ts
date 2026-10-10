import { parseHostMessage } from '../core/results/parse-host-message.ts'
import {
  type HostMessage,
  type WebviewMessage,
  WebviewMessageType,
} from '../core/results/protocol.ts'

// The part of VS Code's webview API (acquireVsCodeApi) the result view uses.
export interface VsCodeApi {
  readonly postMessage: (message: WebviewMessage) => void
}

// Hands each message of the extension host to `onMessage`, once checked; what cannot be read is
// reported to the extension's log. Returns the function that stops listening.
export function listenToHost(
  api: VsCodeApi,
  onMessage: (message: HostMessage) => void,
): () => void {
  const listener = (event: MessageEvent<unknown>): void => {
    let message: HostMessage
    try {
      message = parseHostMessage(event.data)
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error
      }
      api.postMessage({
        type: WebviewMessageType.Problem,
        message: `The result view received a message it cannot read: ${error.message}`,
      })
      return
    }
    onMessage(message)
  }
  // eslint-disable-next-line sonarjs/post-message -- VS Code delivers the extension's messages to this window; each one is checked field by field above
  window.addEventListener('message', listener)
  return () => {
    window.removeEventListener('message', listener)
  }
}
