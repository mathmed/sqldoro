import type { Logger } from '../../core/platform.ts'
import type { TunnelOpener } from '../../core/session/tunnel.ts'
import { SshTunnelOpener } from '../../tunnel/ssh-tunnel.ts'

export function createTunnelOpener(log: Logger): TunnelOpener {
  return new SshTunnelOpener(log)
}
