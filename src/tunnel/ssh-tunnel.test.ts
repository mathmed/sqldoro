import { connect } from 'node:net'

import { utils } from 'ssh2'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { recordingLogger } from '../../test/fakes/logger.ts'
import {
  type EchoServer,
  exchange,
  SSH_SECRET,
  SSH_USER,
  type SshServerOptions,
  startEchoServer,
  startHangUpServer,
  startSshServer,
  startTcpProxy,
  type TestSshServer,
} from '../../test/support/ssh-server.ts'
import { SshAuthMethod } from '../core/connection/connection.ts'
import type { SshCredentials, Tunnel, TunnelRequest } from '../core/session/tunnel.ts'
import { sha256Fingerprint } from './fingerprint.ts'
import { SshTunnelOpener } from './ssh-tunnel.ts'

const KEY_PASSPHRASE = 'key-passphrase'
const CLIENT_KEYS = utils.generateKeyPairSync('ed25519', {
  passphrase: KEY_PASSPHRASE,
  cipher: 'aes256-ctr',
  // One bcrypt round keeps the test fast; real keys use more, the parsing is the same.
  rounds: 1,
})
const PASSWORD: SshCredentials = { method: SshAuthMethod.Password, password: SSH_SECRET }

const cleanups: (() => Promise<void>)[] = []

async function sshServer(options: SshServerOptions = {}): Promise<TestSshServer> {
  const server = await startSshServer(options)
  cleanups.push(server.close)
  return server
}

async function echoServer(): Promise<EchoServer> {
  const server = await startEchoServer()
  cleanups.push(server.close)
  return server
}

function requestTo(
  server: TestSshServer,
  target: EchoServer,
  changes: Partial<TunnelRequest> = {},
): TunnelRequest {
  return {
    server: { host: '127.0.0.1', port: server.port },
    user: SSH_USER,
    credentials: PASSWORD,
    target: { host: '127.0.0.1', port: target.port },
    verifyHostKey: async () => Promise.resolve(true),
    onUnexpectedClose: vi.fn(),
    ...changes,
  }
}

async function open(request: TunnelRequest, log = recordingLogger()): Promise<Tunnel> {
  const tunnel = await new SshTunnelOpener(log).open(request)
  cleanups.push(tunnel.close)
  return tunnel
}

async function isRefused(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      resolve(true)
    })
  })
}

async function until(condition: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(condition()).toBe(true)
  })
}

// Real SSH handshakes with pure JavaScript cryptography: slow when the machine is busy.
describe('SshTunnelOpener', { timeout: 20_000 }, () => {
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
      await cleanup()
    }
  })

  it('should forward a local port to the target with password authentication', async () => {
    const target = await echoServer()
    const tunnel = await open(requestTo(await sshServer(), target))

    expect(tunnel.endpoint.host).toBe('127.0.0.1')
    await expect(exchange(tunnel.endpoint.port, 'ping')).resolves.toBe('ping')
  })

  it('should forward several connections at the same time', async () => {
    const tunnel = await open(requestTo(await sshServer(), await echoServer()))

    await expect(
      Promise.all([exchange(tunnel.endpoint.port, 'one'), exchange(tunnel.endpoint.port, 'two')]),
    ).resolves.toStrictEqual(['one', 'two'])
  })

  it('should log in with an encrypted private key and its passphrase', async () => {
    const target = await echoServer()
    const server = await sshServer({ authorizedKey: CLIENT_KEYS.public })
    const credentials: SshCredentials = {
      method: SshAuthMethod.PrivateKey,
      privateKey: CLIENT_KEYS.private,
      passphrase: KEY_PASSPHRASE,
    }

    const tunnel = await open(requestTo(server, target, { credentials }))

    await expect(exchange(tunnel.endpoint.port, 'key')).resolves.toBe('key')
  })

  it('should answer the password prompts of keyboard-interactive authentication', async () => {
    const target = await echoServer()
    const tunnel = await open(
      requestTo(await sshServer({ isKeyboardInteractiveOnly: true }), target),
    )

    await expect(exchange(tunnel.endpoint.port, 'prompt')).resolves.toBe('prompt')
  })

  it('should ask whether to trust the fingerprint of the host key', async () => {
    const server = await sshServer()
    const verifyHostKey = vi.fn(async () => Promise.resolve(true))

    await open(requestTo(server, await echoServer(), { verifyHostKey }))

    expect(verifyHostKey).toHaveBeenCalledExactlyOnceWith(sha256Fingerprint(server.hostPublicKey))
  })

  it('should refuse a host key the user does not trust and release the local port', async () => {
    const server = await sshServer()
    const request = requestTo(server, await echoServer(), {
      verifyHostKey: async () => Promise.resolve(false),
    })
    const fingerprint = sha256Fingerprint(server.hostPublicKey)

    await expect(new SshTunnelOpener(recordingLogger()).open(request)).rejects.toThrow(
      `SSH connection to ${SSH_USER}@127.0.0.1:${String(server.port)} failed: the host key ${fingerprint} was not trusted`,
    )
  })

  it('should explain that the host key could not be checked', async () => {
    const server = await sshServer()
    const request = requestTo(server, await echoServer(), {
      verifyHostKey: async () => Promise.reject(new Error('the prompt was dismissed')),
    })

    await expect(new SshTunnelOpener(recordingLogger()).open(request)).rejects.toThrow(
      'failed: the host key could not be checked: the prompt was dismissed',
    )
  })

  it('should report a wrong password', async () => {
    const server = await sshServer()
    const credentials: SshCredentials = { method: SshAuthMethod.Password, password: 'wrong' }

    await expect(
      new SshTunnelOpener(recordingLogger()).open(
        requestTo(server, await echoServer(), { credentials }),
      ),
    ).rejects.toThrow(
      `SSH connection to ${SSH_USER}@127.0.0.1:${String(server.port)} failed: All configured authentication methods failed`,
    )
  })

  it('should report a server that hangs up before the SSH handshake', async () => {
    const hangUp = await startHangUpServer()
    cleanups.push(hangUp.close)
    const request = requestTo({ ...(await sshServer()), port: hangUp.port }, await echoServer())

    await expect(new SshTunnelOpener(recordingLogger()).open(request)).rejects.toThrow(
      `SSH connection to ${SSH_USER}@127.0.0.1:${String(hangUp.port)} failed: Connection lost before handshake`,
    )
  })

  it('should report a server that hangs up while logging in', async () => {
    const server = await sshServer({ shouldHangUpOnLogin: true })

    await expect(
      new SshTunnelOpener(recordingLogger()).open(requestTo(server, await echoServer())),
    ).rejects.toThrow(
      `SSH connection to ${SSH_USER}@127.0.0.1:${String(server.port)} failed: the server closed the connection`,
    )
  })

  it('should report an SSH server that cannot be reached', async () => {
    const server = await sshServer()
    const request = requestTo(server, await echoServer())
    await server.close()

    await expect(new SshTunnelOpener(recordingLogger()).open(request)).rejects.toThrow(
      `SSH connection to ${SSH_USER}@127.0.0.1:${String(server.port)} failed: connect ECONNREFUSED 127.0.0.1:${String(server.port)}`,
    )
  })

  it.each([
    {
      problem: 'a missing passphrase',
      key: CLIENT_KEYS.private,
      passphrase: '',
      reason: 'Encrypted private OpenSSH key detected, but no passphrase given',
    },
    {
      problem: 'a wrong passphrase',
      key: CLIENT_KEYS.private,
      passphrase: 'wrong',
      reason: 'OpenSSH key integrity check failed -- bad passphrase?',
    },
    {
      problem: 'an unknown format',
      key: 'not a key',
      passphrase: '',
      reason: 'Unsupported key format',
    },
  ])('should explain $problem before connecting', async ({ key, passphrase, reason }) => {
    const server = await sshServer({ authorizedKey: CLIENT_KEYS.public })
    const credentials: SshCredentials = {
      method: SshAuthMethod.PrivateKey,
      privateKey: key,
      passphrase,
    }

    await expect(
      new SshTunnelOpener(recordingLogger()).open(
        requestTo(server, await echoServer(), { credentials }),
      ),
    ).rejects.toThrow(`The SSH private key cannot be used: ${reason}`)
    expect(server.connections()).toBe(0)
  })

  it('should log in with a private key that has no passphrase', async () => {
    const keys = utils.generateKeyPairSync('ed25519')
    const server = await sshServer({ authorizedKey: keys.public })
    const credentials: SshCredentials = {
      method: SshAuthMethod.PrivateKey,
      privateKey: keys.private,
      passphrase: '',
    }

    const tunnel = await open(requestTo(server, await echoServer(), { credentials }))

    await expect(exchange(tunnel.endpoint.port, 'plain key')).resolves.toBe('plain key')
  })

  it('should keep the reason when the server cannot reach the target', async () => {
    const log = recordingLogger()
    const tunnel = await open(
      requestTo(await sshServer({ canForward: false }), await echoServer()),
      log,
    )

    await expect(exchange(tunnel.endpoint.port, 'lost')).rejects.toThrow(
      'the connection closed before any answer',
    )
    expect(tunnel.forwardingError()?.message).toMatch(/open failure/i)
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^SSH tunnel: the server could not open the forwarded connection: /),
    )
  })

  it('should have no forwarding error while forwarding works', async () => {
    const tunnel = await open(requestTo(await sshServer(), await echoServer()))

    await exchange(tunnel.endpoint.port, 'fine')

    expect(tunnel.forwardingError()).toBeUndefined()
  })

  describe('close', () => {
    it('should stop listening, disconnect from the server and end forwarded connections', async () => {
      const server = await sshServer()
      const tunnel = await open(requestTo(server, await echoServer()))
      const forwarded = connect(tunnel.endpoint.port, '127.0.0.1')
      forwarded.on('error', () => undefined)
      const ended = new Promise((resolve) => forwarded.once('close', resolve))
      await until(() => server.connections() === 1)

      await tunnel.close()

      await ended
      await expect(isRefused(tunnel.endpoint.port)).resolves.toBe(true)
      await until(() => server.connections() === 0)
    })

    it('should be safe to call more than once', async () => {
      const tunnel = await open(requestTo(await sshServer(), await echoServer()))

      await Promise.all([tunnel.close(), tunnel.close()])

      await expect(tunnel.close()).resolves.toBeUndefined()
    })

    it('should not report an unexpected end', async () => {
      const onUnexpectedClose = vi.fn()
      const server = await sshServer()
      const tunnel = await open(requestTo(server, await echoServer(), { onUnexpectedClose }))

      await tunnel.close()
      await until(() => server.connections() === 0)

      expect(onUnexpectedClose).not.toHaveBeenCalled()
    })
  })

  describe('when the server ends the connection', () => {
    it('should report it once and stop listening', async () => {
      const onUnexpectedClose = vi.fn()
      const server = await sshServer()
      const tunnel = await open(requestTo(server, await echoServer(), { onUnexpectedClose }))

      server.disconnectAll()
      await until(() => onUnexpectedClose.mock.calls.length > 0)

      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(
        new Error('The SSH server closed the connection'),
      )
      await expect(isRefused(tunnel.endpoint.port)).resolves.toBe(true)
      await expect(tunnel.close()).resolves.toBeUndefined()
    })

    it('should report the network error of a connection that broke', async () => {
      const onUnexpectedClose = vi.fn()
      const server = await sshServer()
      const proxy = await startTcpProxy(server.port)
      cleanups.push(proxy.close)
      await open(
        requestTo({ ...server, port: proxy.port }, await echoServer(), { onUnexpectedClose }),
      )

      proxy.resetAll()
      await until(() => onUnexpectedClose.mock.calls.length > 0)

      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: expect.stringContaining('ECONNRESET') as unknown }),
      )
    })
  })
})
