// A TCP proxy in front of a database server, for the tests of a network that stops answering. Its
// connections forward both ways until they are stalled: then what either side sends is lost, like
// on a dead VPN. Once it stalls all, the connections opened later never reach the server either. A
// side that closes its socket closes the other.
import { connect, createServer, type Server, type Socket } from 'node:net'

import type { Endpoint } from '../../src/core/engine/engine.ts'

export interface StallProxy {
  readonly endpoint: Endpoint
  // Stops the connections open now; the ones opened later still reach the server.
  readonly stallOpen: () => void
  // Stops the connections open now and every one opened later.
  readonly stallAll: () => void
  // How many sockets of clients are still open.
  readonly openClients: () => number
  readonly close: () => Promise<void>
}

const LOCALHOST = '127.0.0.1'

// A socket the test closes may reset the other side: that is how the proxy goes on.
function ignore(): void {
  // Nothing to do: the other side closes with it.
}

export async function startStallProxy(target: Endpoint): Promise<StallProxy> {
  const clients = new Set<Socket>()
  const stalled = new WeakSet<Socket>()
  const state = { isStallingNew: false }
  const server = createServer((client) => {
    clients.add(client)
    client.on('error', ignore)
    client.on('close', () => clients.delete(client))
    if (state.isStallingNew) {
      stalled.add(client)
      // Read and lose what it sends: a socket nobody reads never hears its client close.
      client.resume()
      return
    }
    forward(client, target, stalled)
  })
  const port = await listen(server)
  const stallOpen = (): void => {
    for (const client of clients) {
      stalled.add(client)
    }
  }
  return {
    endpoint: { host: LOCALHOST, port },
    stallOpen,
    stallAll: () => {
      state.isStallingNew = true
      stallOpen()
    },
    openClients: () => clients.size,
    close: async () => {
      for (const client of clients) {
        client.destroy()
      }
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

function forward(client: Socket, target: Endpoint, stalled: WeakSet<Socket>): void {
  const upstream = connect(target.port, target.host)
  upstream.on('error', ignore)
  client.on('data', (chunk: Buffer) => {
    if (!stalled.has(client)) {
      upstream.write(chunk)
    }
  })
  upstream.on('data', (chunk: Buffer) => {
    if (!stalled.has(client)) {
      client.write(chunk)
    }
  })
  client.on('close', () => upstream.destroy())
  upstream.on('close', () => client.destroy())
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, LOCALHOST, resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('the proxy has no port')
  }
  return address.port
}
