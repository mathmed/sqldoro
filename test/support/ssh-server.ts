// A real SSH server for the tunnel tests, running in the test process on the loopback interface: it
// authenticates with a password, a public key or keyboard-interactive prompts, and forwards
// direct-tcpip channels to the requested address like OpenSSH does.
import { connect, createServer, type Server as NetServer, type Socket } from 'node:net'

import {
  type AuthContext,
  type Connection,
  type ParsedKey,
  type PublicKeyAuthContext,
  Server,
  utils,
} from 'ssh2'

export const SSH_USER = 'tunnel-user'
export const SSH_SECRET = 'tunnel-secret'

export interface SshServerOptions {
  readonly authorizedKey?: string
  readonly isKeyboardInteractiveOnly?: boolean
  readonly canForward?: boolean
  // Ends the connection as soon as the client tries to log in.
  readonly shouldHangUpOnLogin?: boolean
}

export interface TestSshServer {
  readonly port: number
  readonly hostPublicKey: Buffer
  readonly connections: () => number
  // Ends every SSH session politely.
  readonly disconnectAll: () => void
  readonly close: () => Promise<void>
}

const HOST_KEY = utils.generateKeyPairSync('ed25519').private

export async function startSshServer(options: SshServerOptions = {}): Promise<TestSshServer> {
  const clients = new Set<Connection>()
  const authorizedKey =
    options.authorizedKey === undefined ? undefined : parsePublicKey(options.authorizedKey)
  const server = new Server({ hostKeys: [HOST_KEY] }, (client) => {
    clients.add(client)
    client.on('close', () => clients.delete(client))
    client.on('error', () => client.end())
    client.on('authentication', (context) => {
      if (options.shouldHangUpOnLogin === true) {
        client.end()
        return
      }
      authenticate(context, options, authorizedKey)
    })
    client.on('ready', () => {
      client.on('tcpip', (accept, reject, info) => {
        if (options.canForward === false) {
          reject()
          return
        }
        forward(accept, reject, { host: info.destIP, port: info.destPort })
      })
    })
  })
  const port = await listen(server)
  return {
    port,
    hostPublicKey: publicKeyOf(HOST_KEY),
    connections: () => clients.size,
    disconnectAll: () => {
      for (const client of clients) {
        client.end()
      }
    },
    close: async () => closeServer(server),
  }
}

function authenticate(
  context: AuthContext,
  options: SshServerOptions,
  authorizedKey: ParsedKey | undefined,
): void {
  if (context.username !== SSH_USER) {
    context.reject()
    return
  }
  if (options.isKeyboardInteractiveOnly === true) {
    promptForPassword(context)
    return
  }
  if (isAccepted(context, authorizedKey)) {
    context.accept()
    return
  }
  context.reject(['password', 'publickey'])
}

function isAccepted(context: AuthContext, authorizedKey: ParsedKey | undefined): boolean {
  switch (context.method) {
    case 'password':
      return context.password === SSH_SECRET
    case 'publickey':
      return authorizedKey !== undefined && isAuthorized(context, authorizedKey)
    default:
      return false
  }
}

function promptForPassword(context: AuthContext): void {
  if (context.method !== 'keyboard-interactive') {
    context.reject(['keyboard-interactive'])
    return
  }
  context.prompt([{ prompt: 'Password: ', echo: false }], (answers) => {
    if (answers[0] === SSH_SECRET) {
      context.accept()
      return
    }
    context.reject()
  })
}

function isAuthorized(context: PublicKeyAuthContext, key: ParsedKey): boolean {
  const isSameKey = context.key.algo === key.type && context.key.data.equals(key.getPublicSSH())
  if (!isSameKey || context.signature === undefined) {
    return isSameKey
  }
  return key.verify(context.blob ?? Buffer.alloc(0), context.signature, context.hashAlgo)
}

function forward(
  accept: () => NodeJS.ReadWriteStream & { close: () => void },
  reject: () => void,
  target: { host: string; port: number },
): void {
  const socket: Socket = connect(target.port, target.host)
  socket.once('error', () => {
    reject()
  })
  socket.once('connect', () => {
    const channel = accept()
    channel.pipe(socket).pipe(channel)
    socket.on('close', () => {
      channel.close()
    })
  })
}

function parsePublicKey(text: string): ParsedKey {
  const key = utils.parseKey(text)
  if (key instanceof Error) {
    throw key
  }
  return key
}

function publicKeyOf(privateKey: string): Buffer {
  return parsePublicKey(privateKey).getPublicSSH()
}

async function listen(server: NetServer | Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address !== null ? address.port : 0)
    })
  })
}

async function closeServer(server: NetServer | Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve()
    })
  })
}

// A TCP server that answers each connection with what it receives: the database stand-in.
export interface EchoServer {
  readonly port: number
  readonly close: () => Promise<void>
}

export async function startEchoServer(): Promise<EchoServer> {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.pipe(socket)
  })
  const port = await listen(server)
  return {
    port,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy()
      }
      await closeServer(server)
    },
  }
}

// A TCP proxy in front of a local port, whose connections can be dropped like a crashing server.
export interface TcpProxy {
  readonly port: number
  readonly resetAll: () => void
  readonly close: () => Promise<void>
}

export async function startTcpProxy(targetPort: number): Promise<TcpProxy> {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    const upstream = connect(targetPort, '127.0.0.1')
    upstream.on('error', () => socket.destroy())
    upstream.on('close', () => socket.destroy())
    socket.on('close', () => upstream.destroy())
    socket.pipe(upstream).pipe(socket)
  })
  const port = await listen(server)
  return {
    port,
    resetAll: () => {
      for (const socket of sockets) {
        socket.resetAndDestroy()
      }
    },
    close: async () => closeServer(server),
  }
}

// A TCP server that hangs up as soon as a client connects.
export async function startHangUpServer(): Promise<EchoServer> {
  const server = createServer((socket) => {
    socket.on('error', () => socket.destroy())
    // Reading is what lets the socket see the client leave and close.
    socket.resume()
    socket.end()
  })
  const port = await listen(server)
  return { port, close: async () => closeServer(server) }
}

// Opens a connection to a local port, sends a message and resolves with what comes back.
export async function exchange(port: number, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(message)
    })
    socket.once('data', (data) => {
      resolve(data.toString())
      socket.destroy()
    })
    socket.once('error', reject)
    socket.once('close', () => {
      reject(new Error('the connection closed before any answer'))
    })
  })
}
