import { connect, type Socket } from 'node:net'
import { PassThrough } from 'node:stream'

import type { ClientChannel } from 'ssh2'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { recordingLogger } from '../../test/fakes/logger.ts'
import { exchange } from '../../test/support/ssh-server.ts'
import type { Logger } from '../core/platform.ts'
import { type ForwardingClient, LocalForwarder } from './local-forwarder.ts'

type ChannelCallback = (error: Error | undefined, channel: ClientChannel) => void
type ForwardOutArguments = Parameters<ForwardingClient['forwardOut']>

const TARGET = { host: 'db.internal', port: 5432 }
const forwarders: LocalForwarder[] = []

type EchoChannel = ClientChannel & PassThrough

// The SSH channel stand-in: a stream that sends back what it receives.
function echoChannel(close: () => void = vi.fn()): EchoChannel {
  return Object.assign(new PassThrough(), { close }) as unknown as EchoChannel
}

// The SSH client stand-in: it hands each forwarding request to `answer`, which opens the channel.
function forwardingClient(answer: (callback: ChannelCallback) => void): ForwardingClient & {
  readonly requests: ForwardOutArguments[]
} {
  const requests: ForwardOutArguments[] = []
  return {
    requests,
    forwardOut: (...request: ForwardOutArguments) => {
      requests.push(request)
      answer(request[4] as ChannelCallback)
      return undefined as never
    },
  }
}

async function listening(
  log: Logger = recordingLogger(),
): Promise<{ sut: LocalForwarder; port: number }> {
  const sut = new LocalForwarder(TARGET, log)
  forwarders.push(sut)
  const { port } = await sut.listen()
  return { sut, port }
}

async function closed(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('close', () => {
      resolve()
    })
  })
}

describe('LocalForwarder', () => {
  afterEach(async () => {
    await Promise.all(forwarders.splice(0).map(async (forwarder) => forwarder.close()))
  })

  it('should listen on a free port of the loopback interface', async () => {
    const sut = new LocalForwarder(TARGET, recordingLogger())
    forwarders.push(sut)

    const endpoint = await sut.listen()

    expect(endpoint.host).toBe('127.0.0.1')
    expect(endpoint.port).toBeGreaterThan(0)
  })

  it('should close connections that arrive before the SSH client is ready', async () => {
    const { port } = await listening()
    const socket = connect(port, '127.0.0.1')

    await closed(socket)

    expect(socket.bytesRead).toBe(0)
  })

  it('should ask the client for a channel to the target and bridge the connection to it', async () => {
    const { sut, port } = await listening()
    const forwardOut = vi.fn<ForwardingClient['forwardOut']>((...args) => {
      ;(args[4] as ChannelCallback)(undefined, echoChannel())
      return undefined as never
    })
    sut.use({ forwardOut })

    await expect(exchange(port, 'through the channel')).resolves.toBe('through the channel')
    expect(forwardOut).toHaveBeenCalledWith(
      '127.0.0.1',
      0,
      'db.internal',
      5432,
      expect.any(Function),
    )
  })

  it('should keep the reason and close the connection when the channel cannot open', async () => {
    const log = recordingLogger()
    const { sut, port } = await listening(log)
    sut.use(
      forwardingClient((callback) => {
        callback(new Error('open failed'), echoChannel())
      }),
    )

    await expect(exchange(port, 'lost')).rejects.toThrow('the connection closed before any answer')
    expect(sut.forwardingError).toStrictEqual(new Error('open failed'))
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      'SSH tunnel: the server could not open the forwarded connection: open failed',
    )
  })

  it('should close a channel that opens after the local connection went away', async () => {
    const close = vi.fn()
    const channel = echoChannel(close)
    let answer: (() => void) | undefined
    const { sut, port } = await listening()
    sut.use(
      forwardingClient((callback) => {
        answer = () => {
          callback(undefined, channel)
        }
      }),
    )
    const socket = connect(port, '127.0.0.1')
    await vi.waitFor(() => {
      expect(answer).toBeDefined()
    })

    socket.destroy()
    await sut.close()
    answer?.()

    expect(close).toHaveBeenCalledOnce()
  })

  it('should close the channel when the local connection ends, and the other way around', async () => {
    const close = vi.fn()
    const channel = echoChannel(close)
    const { sut, port } = await listening()
    sut.use(
      forwardingClient((callback) => {
        callback(undefined, channel)
      }),
    )
    await exchange(port, 'bye')

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalled()
    })
  })

  it('should log the errors of channels and local connections', async () => {
    const log = recordingLogger()
    const channel = echoChannel()
    const { sut, port } = await listening(log)
    sut.use(
      forwardingClient((callback) => {
        callback(undefined, channel)
      }),
    )
    const socket = connect(port, '127.0.0.1')
    await exchangeOnce(socket)

    channel.emit('error', new Error('channel broke'))
    socket.resetAndDestroy()

    await vi.waitFor(() => {
      expect(log.debug).toHaveBeenCalledWith('SSH tunnel: forwarded channel error: channel broke')
      expect(log.debug).toHaveBeenCalledWith(
        expect.stringMatching(/^SSH tunnel: local connection error: .*ECONNRESET/),
      )
    })
  })

  it('should end every open connection when it closes', async () => {
    const { sut, port } = await listening()
    sut.use(
      forwardingClient((callback) => {
        callback(undefined, echoChannel())
      }),
    )
    const socket = connect(port, '127.0.0.1')
    await exchangeOnce(socket)

    await sut.close()
    await closed(socket)

    expect(socket.destroyed).toBe(true)
  })
})

async function exchangeOnce(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('data', () => {
      resolve()
    })
    socket.write('hello')
  })
}
