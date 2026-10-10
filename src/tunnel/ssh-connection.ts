import { connect, type Socket } from 'node:net'

import {
  Client,
  type ConnectConfig,
  type KeyboardInteractiveCallback,
  type Prompt,
  utils,
} from 'ssh2'

import { SshAuthMethod } from '../core/connection/connection.ts'
import type { Logger } from '../core/platform.ts'
import type { SshCredentials, TunnelRequest } from '../core/session/tunnel.ts'
import { describeError } from '../core/text/errors.ts'
import { sha256Fingerprint } from './fingerprint.ts'

const READY_TIMEOUT_MS = 20_000
const KEEPALIVE_INTERVAL_MS = 15_000
const KEEPALIVE_COUNT_MAX = 3

type KeyboardInteractiveArguments = [string, string, string, Prompt[], KeyboardInteractiveCallback]

export interface SshConnection {
  readonly client: Client
  // Owned by the tunnel so that closing never depends on the server answering.
  readonly socket: Socket
}

// Trust is decided by the user (see verifyHostKey); the reason of a refusal explains the failure.
class HostKeyGate {
  #problem: string | undefined
  readonly #verify: (fingerprint: string) => Promise<boolean>

  constructor(verify: (fingerprint: string) => Promise<boolean>) {
    this.#verify = verify
  }

  get problem(): string | undefined {
    return this.#problem
  }

  readonly verifier = (key: Buffer, answer: (isValid: boolean) => void): void => {
    void this.#decide(sha256Fingerprint(key)).then(answer)
  }

  async #decide(fingerprint: string): Promise<boolean> {
    try {
      const isTrusted = await this.#verify(fingerprint)
      this.#problem = isTrusted ? undefined : `the host key ${fingerprint} was not trusted`
      return isTrusted
    } catch (error) {
      this.#problem = `the host key could not be checked: ${describeError(error)}`
      return false
    }
  }
}

export async function connectSsh(request: TunnelRequest, log: Logger): Promise<SshConnection> {
  checkPrivateKey(request.credentials)
  const gate = new HostKeyGate(request.verifyHostKey)
  const client = new Client()
  const socket = connect(request.server.port, request.server.host)
  client.on('error', (error) => {
    log.debug(`SSH ${describeServer(request)}: ${describeError(error)}`)
  })
  answerPasswordPrompts(client, request.credentials)
  try {
    await untilReady(client, { ...connectConfig(request, gate), sock: socket })
  } catch (error) {
    socket.destroy()
    const reason = gate.problem ?? describeError(error)
    throw new Error(`SSH connection to ${describeServer(request)} failed: ${reason}`, {
      cause: error,
    })
  }
  return { client, socket }
}

function describeServer({ user, server }: TunnelRequest): string {
  return `${user}@${server.host}:${String(server.port)}`
}

function checkPrivateKey(credentials: SshCredentials): void {
  if (credentials.method === SshAuthMethod.Password) {
    return
  }
  const key = utils.parseKey(credentials.privateKey, passphraseOf(credentials.passphrase))
  if (key instanceof Error) {
    throw new Error(`The SSH private key cannot be used: ${key.message}`, { cause: key })
  }
}

// Servers that only accept keyboard-interactive authentication ask for the password that way.
function answerPasswordPrompts(client: Client, credentials: SshCredentials): void {
  if (credentials.method !== SshAuthMethod.Password) {
    return
  }
  client.on('keyboard-interactive', (...[, , , prompts, finish]: KeyboardInteractiveArguments) => {
    finish(prompts.map(() => credentials.password))
  })
}

function connectConfig(request: TunnelRequest, gate: HostKeyGate): ConnectConfig {
  return {
    host: request.server.host,
    port: request.server.port,
    username: request.user,
    readyTimeout: READY_TIMEOUT_MS,
    keepaliveInterval: KEEPALIVE_INTERVAL_MS,
    keepaliveCountMax: KEEPALIVE_COUNT_MAX,
    hostVerifier: gate.verifier,
    ...authenticationOf(request.credentials),
  }
}

function authenticationOf(credentials: SshCredentials): ConnectConfig {
  if (credentials.method === SshAuthMethod.Password) {
    return { password: credentials.password, tryKeyboard: true }
  }
  const passphrase = passphraseOf(credentials.passphrase)
  return passphrase === undefined
    ? { privateKey: credentials.privateKey }
    : { privateKey: credentials.privateKey, passphrase }
}

// ssh2 explains a missing passphrase only when none is given, not when it is empty.
function passphraseOf(passphrase: string): string | undefined {
  return passphrase === '' ? undefined : passphrase
}

async function untilReady(client: Client, config: ConnectConfig): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<undefined>()
  const settle = (): void => {
    client.off('ready', onReady).off('error', onError).off('close', onClose)
  }
  const onReady = (): void => {
    settle()
    resolve(undefined)
  }
  const onError = (error: Error): void => {
    settle()
    reject(error)
  }
  const onClose = (): void => {
    settle()
    reject(new Error('the server closed the connection'))
  }
  client.once('ready', onReady).once('error', onError).once('close', onClose)
  client.connect(config)
  return promise
}
