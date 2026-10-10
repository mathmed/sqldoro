// The part of VS Code's webview API (acquireVsCodeApi) a view uses: M is what the view posts.
export interface VsCodeApi<M> {
  readonly postMessage: (message: M) => void
}

// How a view reads the messages of the extension host (H), and reports to its log those it cannot.
export interface HostChannel<H, M> {
  readonly parse: (data: unknown) => H
  readonly problem: (message: string) => M
}

// Hands each message of the extension host to `onMessage`, once checked; what cannot be read is
// reported to the extension's log. Returns the function that stops listening.
export function listenToHost<H, M>(
  api: VsCodeApi<M>,
  channel: HostChannel<H, M>,
  onMessage: (message: H) => void,
): () => void {
  const listener = (event: MessageEvent<unknown>): void => {
    let message: H
    try {
      message = channel.parse(event.data)
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error
      }
      api.postMessage(channel.problem(error.message))
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
