import type { Client } from 'ssh2'

import type { Endpoint } from '../core/engine/engine.ts'
import type { Logger } from '../core/platform.ts'
import type { Tunnel, TunnelOpener, TunnelRequest } from '../core/session/tunnel.ts'
import { LocalForwarder } from './local-forwarder.ts'
import { connectSsh, type SshConnection } from './ssh-connection.ts'

interface TunnelParts {
  readonly connection: SshConnection
  readonly forwarder: LocalForwarder
  readonly endpoint: Endpoint
}

export class SshTunnelOpener implements TunnelOpener {
  readonly #log: Logger

  constructor(log: Logger) {
    this.#log = log
  }

  readonly open = async (request: TunnelRequest): Promise<Tunnel> => {
    const forwarder = new LocalForwarder(request.target, this.#log)
    const endpoint = await forwarder.listen()
    try {
      const connection = await connectSsh(request, this.#log)
      forwarder.use(connection.client)
      return new SshTunnel({ connection, forwarder, endpoint }, request.onUnexpectedClose)
    } catch (error) {
      await forwarder.close()
      throw error
    }
  }
}

class SshTunnel implements Tunnel {
  readonly endpoint: Endpoint
  readonly #client: Client
  readonly #parts: TunnelParts
  #closing: Promise<void> | undefined
  #lastError: Error | undefined

  constructor(parts: TunnelParts, onUnexpectedClose: (error: Error) => void) {
    this.endpoint = parts.endpoint
    this.#client = parts.connection.client
    this.#parts = parts
    this.#client.on('error', (error) => {
      this.#lastError = error
    })
    this.#client.once('close', () => {
      this.#onClientClose(onUnexpectedClose)
    })
  }

  readonly forwardingError = (): Error | undefined => this.#parts.forwarder.forwardingError

  readonly close = async (): Promise<void> => {
    this.#closing ??= this.#shutDown()
    return this.#closing
  }

  #onClientClose(onUnexpectedClose: (error: Error) => void): void {
    if (this.#closing !== undefined) {
      return
    }
    this.#closing = this.#parts.forwarder.close()
    onUnexpectedClose(this.#lastError ?? new Error('The SSH server closed the connection'))
  }

  async #shutDown(): Promise<void> {
    await this.#parts.forwarder.close()
    // A graceful SSH disconnect, then the socket goes away whether or not the server answers.
    this.#client.end()
    this.#parts.connection.socket.destroy()
  }
}
