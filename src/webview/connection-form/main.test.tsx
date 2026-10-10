import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeVsCodeApi } from '../../../test/webview/vscode-api.ts'

beforeEach(() => {
  vi.resetModules()
  document.body.replaceChildren()
})

describe('the connection form entry point', () => {
  it('should render the form in the root element with the API of VS Code', async () => {
    const api = fakeVsCodeApi()
    vi.stubGlobal('acquireVsCodeApi', () => api)
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)

    await act(async () => import('./main.tsx'))

    expect(screen.getByText('Loading the connection…')).toBeDefined()
    expect(api.postMessage).toHaveBeenCalledWith({ type: 'ready' })
  })

  it('should fail loudly without a root element', async () => {
    await expect(import('./main.tsx')).rejects.toThrow('The connection form has no root element')
  })
})
