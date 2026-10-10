import type { SshAuthMethod } from '../connection/connection.ts'
import type { Endpoint } from '../engine/engine.ts'

export type SshCredentials =
  | {
      readonly method: typeof SshAuthMethod.Password
      readonly password: string
    }
  | {
      readonly method: typeof SshAuthMethod.PrivateKey
      readonly privateKey: string
      readonly passphrase: string
    }

export interface TunnelRequest {
  readonly server: Endpoint
  readonly user: string
  readonly credentials: SshCredentials
  // The database as the SSH server sees it.
  readonly target: Endpoint
  // Answers whether the host key with this SHA256 fingerprint can be trusted.
  readonly verifyHostKey: (fingerprint: string) => Promise<boolean>
  // Called at most once, when the SSH connection ends without close().
  readonly onUnexpectedClose: (error: Error) => void
}

export interface Tunnel {
  // The local address that forwards to the target.
  readonly endpoint: Endpoint
  // The last time the SSH server could not reach the target: it explains why a database client
  // that dialed the tunnel lost its connection.
  readonly forwardingError: () => Error | undefined
  // Never rejects: closing is best effort and always completes.
  readonly close: () => Promise<void>
}

export interface TunnelOpener {
  readonly open: (request: TunnelRequest) => Promise<Tunnel>
}
