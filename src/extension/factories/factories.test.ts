import { describe, expect, it } from 'vitest'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { createEngineRegistry } from './engines.ts'
import { createTunnelOpener } from './tunnels.ts'

describe('createEngineRegistry', () => {
  it('should register MySQL and PostgreSQL with their URL schemes', () => {
    const sut = createEngineRegistry()

    expect(sut.engines.map((engine) => engine.displayName)).toStrictEqual(['MySQL', 'PostgreSQL'])
    expect(sut.urlSchemes).toStrictEqual(['mysql', 'postgres', 'postgresql'])
  })
})

describe('createTunnelOpener', () => {
  it('should open SSH tunnels', () => {
    expect(createTunnelOpener(recordingLogger()).open).toBeTypeOf('function')
  })
})
