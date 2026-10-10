import { randomBytes } from 'node:crypto'

import type * as vscode from 'vscode'

export interface WebviewAssets {
  readonly script: vscode.Uri
  readonly style: vscode.Uri
}

const NONCE_BYTES = 18

export function createNonce(): string {
  return randomBytes(NONCE_BYTES).toString('base64')
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

// The page of the result webview: only the bundle with this nonce may run, and only styles and
// images from the extension load. Inline styles set by script (CSSOM) stay allowed by design.
export function resultsHtml(webview: vscode.Webview, assets: WebviewAssets, nonce: string): string {
  const source = webview.cspSource
  const policy = [
    "default-src 'none'",
    `img-src ${source} data:`,
    `font-src ${source}`,
    `style-src ${source}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ')
  const style = escapeHtml(webview.asWebviewUri(assets.style).toString())
  const script = escapeHtml(webview.asWebviewUri(assets.script).toString())
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${style}">
<title>Results</title>
</head>
<body>
<div id="root"></div>
<script type="module" nonce="${escapeHtml(nonce)}" src="${script}"></script>
</body>
</html>
`
}
