import { type AddressInfo, createServer, type Server, type Socket } from 'node:net'

import type { Client, ClientChannel } from 'ssh2'

import type { Endpoint } from '../core/engine/engine.ts'
import type { Logger } from '../core/platform.ts'
import { describeError } from '../core/text/errors.ts'

export type ForwardingClient = Pick<Client, 'forwardOut'>

// Only this machine can reach the tunnel, and the system picks a free port. The SSH server only
// logs the originator address of a forwarded connection.
const LOOPBACK = '127.0.0.1'
const ANY_PORT = 0

// Listens on a local port and forwards every connection it accepts through the SSH client.
export class LocalForwarder {
  readonly #server: Server
  readonly #sockets = new Set<Socket>()
  readonly #target: Endpoint
  readonly #log: Logger
  #client: ForwardingClient | undefined
  #forwardingError: Error | undefined

  constructor(target: Endpoint, log: Logger) {
    this.#target = target
    this.#log = log
    this.#server = createServer((socket) => {
      this.#accept(socket)
    })
    this.#server.on('error', this.#logged('the local listener failed'))
  }

  get forwardingError(): Error | undefined {
    return this.#forwardingError
  }

  async listen(): Promise<Endpoint> {
    const { promise, resolve, reject } = Promise.withResolvers<undefined>()
    this.#server.once('error', reject)
    this.#server.listen(ANY_PORT, LOOPBACK, () => {
      this.#server.off('error', reject)
      resolve(undefined)
    })
    await promise
    // A TCP server that listens always has an address with a port.
    const { port } = this.#server.address() as AddressInfo
    return { host: LOOPBACK, port }
  }

  use(client: ForwardingClient): void {
    this.#client = client
  }

  async close(): Promise<void> {
    for (const socket of this.#sockets) {
      socket.destroy()
    }
    const { promise, resolve } = Promise.withResolvers<undefined>()
    this.#server.close(() => {
      resolve(undefined)
    })
    await promise
  }

  #accept(socket: Socket): void {
    this.#sockets.add(socket)
    socket.once('close', () => this.#sockets.delete(socket))
    socket.on('error', this.#logged('local connection error'))
    const client = this.#client
    if (client === undefined) {
      socket.destroy()
      return
    }
    const { host, port } = this.#target
    client.forwardOut(LOOPBACK, ANY_PORT, host, port, (error, channel) => {
      this.#bridge(socket, error, channel)
    })
  }

  #bridge(socket: Socket, error: Error | undefined, channel: ClientChannel): void {
    if (error !== undefined) {
      this.#forwardingError = error
      const reason = describeError(error)
      this.#log.warn(`SSH tunnel: the server could not open the forwarded connection: ${reason}`)
      socket.destroy()
      return
    }
    if (socket.destroyed) {
      channel.close()
      return
    }
    channel.on('error', this.#logged('forwarded channel error'))
    channel.once('close', () => socket.destroy())
    socket.once('close', () => {
      channel.close()
    })
    socket.pipe(channel).pipe(socket)
  }

  #logged(context: string): (error: Error) => void {
    return (error) => {
      this.#log.debug(`SSH tunnel: ${context}: ${describeError(error)}`)
    }
  }
}
