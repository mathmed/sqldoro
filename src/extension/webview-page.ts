import { randomBytes } from 'node:crypto'

import * as vscode from 'vscode'

// A bundle scripts/build.ts makes for a webview: <name>.js and <name>.css in dist/webview.
export interface WebviewBundle {
  readonly script: vscode.Uri
  readonly style: vscode.Uri
}

export interface WebviewPage {
  readonly title: string
  readonly bundle: WebviewBundle
}

const WEBVIEW_DIRECTORY = ['dist', 'webview']
const NONCE_BYTES = 18

// Where the bundles of the webviews are: the only files a webview may load.
export function webviewRoot(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIRECTORY)
}

export function bundleOf(root: vscode.Uri, name: string): WebviewBundle {
  return {
    script: vscode.Uri.joinPath(root, `${name}.js`),
    style: vscode.Uri.joinPath(root, `${name}.css`),
  }
}

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

// The page of a webview: only its bundle with this nonce may run, and only styles and images from
// the extension load. Inline styles set by script (CSSOM) stay allowed by design.
export function webviewHtml(webview: vscode.Webview, page: WebviewPage, nonce: string): string {
  const source = webview.cspSource
  const policy = [
    "default-src 'none'",
    `img-src ${source} data:`,
    `font-src ${source}`,
    `style-src ${source}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ')
  const style = escapeHtml(webview.asWebviewUri(page.bundle.style).toString())
  const script = escapeHtml(webview.asWebviewUri(page.bundle.script).toString())
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${style}">
<title>${escapeHtml(page.title)}</title>
</head>
<body>
<div id="root"></div>
<script type="module" nonce="${escapeHtml(nonce)}" src="${script}"></script>
</body>
</html>
`
}
