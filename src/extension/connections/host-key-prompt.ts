import * as vscode from 'vscode'

import type { HostKeyCheck } from '../../core/session/host-key.ts'
import type { HostKeyPrompt } from '../storage/known-hosts.ts'

const TRUST = 'Trust and Connect'
const REPLACE = 'Trust the New Key'

function serverOf({ host, port }: HostKeyCheck): string {
  return `${host}:${String(port)}`
}

// Trust on first use, like OpenSSH: the user compares the fingerprint before trusting a server.
export const hostKeyPrompt: HostKeyPrompt = {
  trustNewHost: async (check) => {
    const choice = await vscode.window.showWarningMessage(
      `Trust the SSH server ${serverOf(check)}?`,
      {
        modal: true,
        detail: `sqldoro has never connected to this server. Its host key fingerprint is ${check.fingerprint}: compare it with the one the server administrator gives you (ssh-keygen -l) before trusting it.`,
      },
      TRUST,
    )
    return choice === TRUST
  },
  trustChangedHost: async (check, knownFingerprint) => {
    const choice = await vscode.window.showWarningMessage(
      `The host key of the SSH server ${serverOf(check)} has changed`,
      {
        modal: true,
        detail: `Someone may be intercepting the connection, or the server was reinstalled. Trusted fingerprint: ${knownFingerprint}. New fingerprint: ${check.fingerprint}. Only trust the new key if you know why it changed.`,
      },
      REPLACE,
    )
    return choice === REPLACE
  },
}
