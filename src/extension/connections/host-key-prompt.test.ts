import { describe, expect, it, vi } from 'vitest'

import { window } from '../../../test/vscode.ts'
import { hostKeyPrompt } from './host-key-prompt.ts'

const CHECK = { host: 'bastion', port: 22, fingerprint: 'SHA256:new' }

describe('hostKeyPrompt', () => {
  it('should show the fingerprint of a new server and trust it when the user agrees', async () => {
    window.showWarningMessage.mockResolvedValueOnce('Trust and Connect')

    await expect(hostKeyPrompt.trustNewHost(CHECK)).resolves.toBe(true)
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Trust the SSH server bastion:22?',
      expect.objectContaining({
        modal: true,
        detail: expect.stringContaining('SHA256:new') as unknown,
      }),
      'Trust and Connect',
    )
  })

  it('should not trust a new server when the warning is dismissed', async () => {
    window.showWarningMessage.mockResolvedValueOnce(undefined)

    await expect(hostKeyPrompt.trustNewHost(CHECK)).resolves.toBe(false)
  })

  it('should warn about a changed key with both fingerprints', async () => {
    window.showWarningMessage.mockResolvedValueOnce('Trust the New Key')

    await expect(hostKeyPrompt.trustChangedHost(CHECK, 'SHA256:old')).resolves.toBe(true)
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'The host key of the SSH server bastion:22 has changed',
      expect.objectContaining({
        detail: expect.stringMatching(/SHA256:old.*SHA256:new/) as unknown,
      }),
      'Trust the New Key',
    )
  })

  it('should keep the old key when the warning is dismissed', async () => {
    vi.mocked(window.showWarningMessage).mockResolvedValueOnce(undefined)

    await expect(hostKeyPrompt.trustChangedHost(CHECK, 'SHA256:old')).resolves.toBe(false)
  })
})
