// Test double of an SSH tunnel: it stands in for the SSH server and records what was asked of it.
import type { Endpoint } from '../../src/core/engine/engine.ts'
import type { Tunnel, TunnelOpener, TunnelRequest } from '../../src/core/session/tunnel.ts'

export const TUNNEL_ENDPOINT: Endpoint = { host: '127.0.0.1', port: 40_000 }

export interface FakeTunnelOpener extends TunnelOpener {
  readonly requests: readonly TunnelRequest[]
  readonly closeCount: () => number
}

export function fakeTunnelOpener(
  open: (request: TunnelRequest) => Promise<Tunnel> = async () => Promise.resolve(fakeTunnel()),
): FakeTunnelOpener {
  const requests: TunnelRequest[] = []
  let closeCount = 0
  return {
    requests,
    closeCount: () => closeCount,
    open: async (request) => {
      requests.push(request)
      const tunnel = await open(request)
      return {
        endpoint: tunnel.endpoint,
        forwardingError: tunnel.forwardingError,
        close: async () => {
          closeCount += 1
          await tunnel.close()
        },
      }
    },
  }
}

export function fakeTunnel(
  close: () => Promise<void> = async () => Promise.resolve(),
  forwardingError?: Error,
): Tunnel {
  return { endpoint: TUNNEL_ENDPOINT, forwardingError: () => forwardingError, close }
}
