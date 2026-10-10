import { describe, expect, it, type Mock, vi } from 'vitest'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { type HostKeyPrompt, KnownHosts } from './known-hosts.ts'

const CHECK = { host: 'Bastion.example.com', port: 22, fingerprint: 'SHA256:first' }

interface RecordingPrompt extends HostKeyPrompt {
  readonly trustNewHost: Mock<HostKeyPrompt['trustNewHost']>
  readonly trustChangedHost: Mock<HostKeyPrompt['trustChangedHost']>
}

function prompt(isTrusted: boolean): RecordingPrompt {
  return {
    trustNewHost: vi.fn<HostKeyPrompt['trustNewHost']>(async () => Promise.resolve(isTrusted)),
    trustChangedHost: vi.fn<HostKeyPrompt['trustChangedHost']>(async () =>
      Promise.resolve(isTrusted),
    ),
  }
}

describe('KnownHosts', () => {
  it('should ask about a new server and remember it once trusted', async () => {
    const memento = new FakeMemento()
    const yes = prompt(true)

    await expect(new KnownHosts(memento, yes).verify(CHECK)).resolves.toBe(true)
    await expect(
      new KnownHosts(memento, prompt(false)).verify({ ...CHECK, host: 'bastion.EXAMPLE.com' }),
    ).resolves.toBe(true)

    expect(yes.trustNewHost).toHaveBeenCalledExactlyOnceWith(CHECK)
    expect(memento.get('sqldoro.sshKnownHosts')).toStrictEqual({ version: 1, hosts: [CHECK] })
  })

  it('should not remember a server the user did not trust', async () => {
    const memento = new FakeMemento()

    await expect(new KnownHosts(memento, prompt(false)).verify(CHECK)).resolves.toBe(false)

    expect(memento.get('sqldoro.sshKnownHosts')).toBeUndefined()
  })

  it('should warn about a key that changed and keep the old one unless the user trusts the new one', async () => {
    const memento = new FakeMemento()
    await new KnownHosts(memento, prompt(true)).verify(CHECK)
    const changed = { ...CHECK, fingerprint: 'SHA256:second' }
    const no = prompt(false)

    await expect(new KnownHosts(memento, no).verify(changed)).resolves.toBe(false)

    expect(no.trustChangedHost).toHaveBeenCalledExactlyOnceWith(changed, 'SHA256:first')
    expect(memento.get('sqldoro.sshKnownHosts')).toStrictEqual({ version: 1, hosts: [CHECK] })
  })

  it('should replace a changed key the user trusts', async () => {
    const memento = new FakeMemento()
    await new KnownHosts(memento, prompt(true)).verify(CHECK)
    const changed = { ...CHECK, fingerprint: 'SHA256:second' }

    await expect(new KnownHosts(memento, prompt(true)).verify(changed)).resolves.toBe(true)

    expect(memento.get('sqldoro.sshKnownHosts')).toStrictEqual({ version: 1, hosts: [changed] })
  })

  it('should tell servers on other ports apart', async () => {
    const memento = new FakeMemento()
    await new KnownHosts(memento, prompt(true)).verify(CHECK)
    const yes = prompt(true)

    await new KnownHosts(memento, yes).verify({ ...CHECK, port: 2222 })

    expect(yes.trustNewHost).toHaveBeenCalledOnce()
  })

  it.each([
    { kind: 'junk', stored: 'junk' },
    { kind: 'an entry of the wrong shape', stored: { version: 1, hosts: [{ host: 'x' }] } },
    { kind: 'another version', stored: { version: 2, hosts: [CHECK] } },
  ])('should ask again about servers whose stored keys are $kind', async ({ stored }) => {
    const memento = new FakeMemento()
    await memento.update('sqldoro.sshKnownHosts', stored)
    const yes = prompt(true)

    await new KnownHosts(memento, yes).verify(CHECK)

    expect(yes.trustNewHost).toHaveBeenCalledOnce()
  })

  it('should let unexpected errors through', async () => {
    const memento = new FakeMemento()
    vi.spyOn(memento, 'get').mockImplementation(() => {
      throw new Error('storage failure')
    })

    await expect(new KnownHosts(memento, prompt(true)).verify(CHECK)).rejects.toThrow(
      'storage failure',
    )
  })
})
