export const HostKeyStatus = {
  Trusted: 'trusted',
  Unknown: 'unknown',
  Changed: 'changed',
} as const

export type HostKeyStatus = (typeof HostKeyStatus)[keyof typeof HostKeyStatus]

export interface HostKeyCheck {
  readonly host: string
  readonly port: number
  readonly fingerprint: string
}

// Trust on first use, like OpenSSH: a known server must present the key it presented before.
export function assessHostKey(known: string | undefined, presented: string): HostKeyStatus {
  if (known === undefined) {
    return HostKeyStatus.Unknown
  }
  return known === presented ? HostKeyStatus.Trusted : HostKeyStatus.Changed
}
