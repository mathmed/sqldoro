import { describe, expect, it, vi } from 'vitest'

import { fakeEngine, fakeSession } from '../../../test/fakes/engine.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { VALID_CONNECTION } from '../../../test/fixtures/connection-form.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Session, SessionRequest } from '../../core/session/open-session.ts'
import { listServerDatabases, pingServer } from './server-test.ts'

const SECRETS = new Map([[SecretKind.Password, 's3cret']])

function opener(engineSession: EngineSession): {
  readonly open: (request: SessionRequest) => Promise<Session>
  readonly requests: SessionRequest[]
  readonly close: ReturnType<typeof vi.fn>
} {
  const requests: SessionRequest[] = []
  const close = vi.fn(async () => Promise.resolve())
  const open = async (request: SessionRequest): Promise<Session> => {
    requests.push(request)
    return Promise.resolve({ engine: fakeEngine({ displayName: 'MySQL' }), engineSession, close })
  }
  return { open, requests, close }
}

describe('pingServer', () => {
  it('should ping the server with the secrets, name it and close the session', async () => {
    const log = recordingLogger()
    const ping = vi.fn(async () => Promise.resolve())
    const { open, requests, close } = opener(fakeSession({ serverVersion: '8.4.2', ping }))

    const sut = await pingServer({ open, log }, VALID_CONNECTION, SECRETS)

    expect(sut).toBe('MySQL 8.4.2')
    expect(requests[0]).toMatchObject({ connection: VALID_CONNECTION, secrets: SECRETS })
    expect(ping).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    requests[0]?.onUnexpectedClose(new Error('late'))
    expect(log.debug).toHaveBeenCalledWith('The short session of Shop ended: late')
  })

  it('should close the session when the server does not answer', async () => {
    const { open, close } = opener(
      fakeSession({ ping: async () => Promise.reject(new Error('timeout')) }),
    )

    await expect(
      pingServer({ open, log: recordingLogger() }, VALID_CONNECTION, SECRETS),
    ).rejects.toThrow('timeout')
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('listServerDatabases', () => {
  it('should list the databases of the server by name with the secrets, and close the session', async () => {
    const listDatabases = vi.fn<EngineSession['listDatabases']>(async () =>
      Promise.resolve([{ name: 'app' }, { name: 'shop' }]),
    )
    const { open, requests, close } = opener(fakeSession({ listDatabases }))

    const sut = await listServerDatabases(
      { open, log: recordingLogger() },
      VALID_CONNECTION,
      SECRETS,
    )

    expect(sut).toStrictEqual(['app', 'shop'])
    expect(listDatabases).toHaveBeenCalledExactlyOnceWith(CatalogDetail.Names)
    expect(requests[0]).toMatchObject({ connection: VALID_CONNECTION, secrets: SECRETS })
    expect(close).toHaveBeenCalledOnce()
  })

  it('should close the session when the catalog cannot be read', async () => {
    const { open, close } = opener(
      fakeSession({ listDatabases: async () => Promise.reject(new Error('permission denied')) }),
    )

    await expect(
      listServerDatabases({ open, log: recordingLogger() }, VALID_CONNECTION, SECRETS),
    ).rejects.toThrow('permission denied')
    expect(close).toHaveBeenCalledOnce()
  })
})
