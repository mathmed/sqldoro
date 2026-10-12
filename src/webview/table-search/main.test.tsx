import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeVsCodeApi } from '../../../test/webview/vscode-api.ts'

beforeEach(() => {
  vi.resetModules()
  document.body.replaceChildren()
})

describe('the table search entry point', () => {
  it('should render the box in the root element with the API of VS Code', async () => {
    const api = fakeVsCodeApi()
    vi.stubGlobal('acquireVsCodeApi', () => api)
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)

    await act(async () => import('./main.tsx'))

    expect(screen.getByRole('textbox', { name: 'Filter tables and views' })).toBeDefined()
    expect(api.postMessage).toHaveBeenCalledWith({ type: 'ready' })
  })

  it('should fail loudly without a root element', async () => {
    await expect(import('./main.tsx')).rejects.toThrow('The table search has no root element')
  })
})
