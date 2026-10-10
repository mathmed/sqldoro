import '../base.css'
import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import type { FormApi } from './form-api.ts'

// VS Code gives each webview this function; it can be called once.
declare function acquireVsCodeApi(): FormApi

const root = document.getElementById('root')
if (root === null) {
  throw new Error('The connection form has no root element')
}
createRoot(root).render(
  <StrictMode>
    <App api={acquireVsCodeApi()} />
  </StrictMode>,
)
