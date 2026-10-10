import { describe, expect, it, vi } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import { fakeVsCodeApi, fromHost } from '../../test/webview/vscode-api.ts'
import { listenToHost } from './host.ts'
import { RESULTS_CHANNEL } from './results-api.ts'

describe('listenToHost', () => {
  it('should hand on the messages of the host once checked, until it stops listening', () => {
    const api = fakeVsCodeApi()
    const onMessage = vi.fn()
    const stop = listenToHost(api, RESULTS_CHANNEL, onMessage)
    const message = { type: 'tab', tab: resultTab() }

    fromHost(message)
    stop()
    fromHost(message)

    expect(onMessage).toHaveBeenCalledExactlyOnceWith(message)
  })

  it('should report a message it cannot read to the host instead', () => {
    const api = fakeVsCodeApi()
    const onMessage = vi.fn()
    listenToHost(api, RESULTS_CHANNEL, onMessage)

    fromHost({ type: 'rows' })

    expect(onMessage).not.toHaveBeenCalled()
    expect(api.posted()).toStrictEqual([
      {
        type: 'problem',
        message: 'The result view received a message it cannot read: "tabId" must be a string',
      },
    ])
  })

  it('should let other errors through', () => {
    const api = fakeVsCodeApi()
    const listen = vi.spyOn(window, 'addEventListener')
    listenToHost(api, RESULTS_CHANNEL, vi.fn())
    const listener = listen.mock.calls[0]?.[1] as unknown as (event: { data: unknown }) => void
    const exploding = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('storage failure')
        },
      },
    )

    expect(() => {
      listener({ data: exploding })
    }).toThrow('storage failure')
  })
})
