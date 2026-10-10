import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { createWebviewPanel, Uri } from '../../../test/vscode.ts'
import { createNonce, resultsHtml } from './results-html.ts'

describe('resultsHtml', () => {
  it('should allow only the scripts with its nonce and the styles of the extension', () => {
    const { webview } = createWebviewPanel('sqldoro.results', 'Results', {}, {})

    const sut = resultsHtml(
      webview as unknown as vscode.Webview,
      {
        script: Uri.file('/ext/dist/webview/results.js'),
        style: Uri.file('/ext/dist/webview/a"&<>.css'),
      } as unknown as {
        script: vscode.Uri
        style: vscode.Uri
      },
      'N0nce+/=',
    )

    expect(sut).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-webview-resource: data:; font-src vscode-webview-resource:; style-src vscode-webview-resource:; script-src 'nonce-N0nce+/='">`,
    )
    expect(sut).toContain(
      '<script type="module" nonce="N0nce+/=" src="webview:/ext/dist/webview/results.js"></script>',
    )
    expect(sut).toContain(
      '<link rel="stylesheet" href="webview:/ext/dist/webview/a&quot;&amp;&lt;&gt;.css">',
    )
    expect(sut).toContain('<div id="root"></div>')
  })
})

describe('createNonce', () => {
  it('should make a new random base64 value each time', () => {
    const first = createNonce()

    expect(first).toMatch(/^[A-Za-z0-9+/]{24}$/)
    expect(createNonce()).not.toBe(first)
  })
})
