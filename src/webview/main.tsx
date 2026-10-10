import './base.css'
import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import type { ResultsApi } from './results-api.ts'

// VS Code gives each webview this function; it can be called once.
declare function acquireVsCodeApi(): ResultsApi

const root = document.getElementById('root')
if (root === null) {
  throw new Error('The result view has no root element')
}
createRoot(root).render(
  <StrictMode>
    <App api={acquireVsCodeApi()} />
  </StrictMode>,
)
