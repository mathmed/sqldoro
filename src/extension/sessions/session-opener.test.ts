import { describe, expect, it, vi } from 'vitest'

import { fakeEngine, fakeSession } from '../../../test/fakes/engine.ts'
import { fakeTunnelOpener } from '../../../test/fakes/tunnel.ts'
import { newConnection } from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { SessionDependencies } from '../../core/session/open-session.ts'
import { createSessionOpener } from './session-opener.ts'

function dependencies(engine = fakeEngine()): SessionDependencies {
  return {
    engines: new EngineRegistry([engine]),
    tunnels: fakeTunnelOpener(),
    files: { readText: async () => Promise.resolve('') },
    verifyHostKey: async () => Promise.resolve(true),
  }
}

const REQUEST = {
  connection: newConnection('id', fakeEngine()),
  secrets: new Map([[SecretKind.Password, 'hunter2']]),
  onUnexpectedClose: vi.fn(),
}

describe('createSessionOpener', () => {
  it('should open the session', async () => {
    const session = fakeSession({ serverVersion: '8.4.11' })
    const sut = createSessionOpener(
      dependencies(fakeEngine({ connect: async () => Promise.resolve(session) })),
    )

    await expect(sut(REQUEST)).resolves.toMatchObject({ engineSession: session })
  })

  it('should mask the secrets of the connection in what a failure says', async () => {
    const engine = fakeEngine({
      connect: async () =>
        Promise.reject(new Error('could not log in with hunter2 to mysql://app:x@db')),
    })
    const sut = createSessionOpener(dependencies(engine))

    await expect(sut(REQUEST)).rejects.toThrow(
      new Error('could not log in with *** to mysql://app:***@db'),
    )
  })
})
