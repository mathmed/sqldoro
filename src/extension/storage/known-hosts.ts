import type * as vscode from 'vscode'

import { readArray, readNumber, readRecord, readString } from '../../core/json/record.ts'
import { assessHostKey, type HostKeyCheck, HostKeyStatus } from '../../core/session/host-key.ts'

// The SSH host keys the user trusted, like OpenSSH's known_hosts: fingerprints are not secret.
const KNOWN_HOSTS_KEY = 'sqldoro.sshKnownHosts'
const STORAGE_VERSION = 1

export interface HostKeyPrompt {
  // Asks whether to trust a server seen for the first time.
  readonly trustNewHost: (check: HostKeyCheck) => Promise<boolean>
  // Warns that a known server presents another key, and asks whether to trust the new one.
  readonly trustChangedHost: (check: HostKeyCheck, knownFingerprint: string) => Promise<boolean>
}

type KnownHost = HostKeyCheck

function addressOf({ host, port }: Pick<KnownHost, 'host' | 'port'>): string {
  return `${host.toLowerCase()}:${String(port)}`
}

export class KnownHosts {
  readonly #memento: vscode.Memento
  readonly #prompt: HostKeyPrompt

  constructor(memento: vscode.Memento, prompt: HostKeyPrompt) {
    this.#memento = memento
    this.#prompt = prompt
  }

  readonly verify = async (check: HostKeyCheck): Promise<boolean> => {
    const known = this.#hosts().get(addressOf(check))?.fingerprint
    if (assessHostKey(known, check.fingerprint) === HostKeyStatus.Trusted) {
      return true
    }
    const isTrusted =
      known === undefined
        ? await this.#prompt.trustNewHost(check)
        : await this.#prompt.trustChangedHost(check, known)
    return this.#rememberIf(isTrusted, check)
  }

  async #rememberIf(isTrusted: boolean, check: HostKeyCheck): Promise<boolean> {
    if (isTrusted) {
      const hosts = new Map(this.#hosts()).set(addressOf(check), check)
      await this.#memento.update(KNOWN_HOSTS_KEY, {
        version: STORAGE_VERSION,
        hosts: [...hosts.values()],
      })
    }
    return isTrusted
  }

  // A stored list that cannot be read is forgotten: the servers are simply asked about again.
  #hosts(): ReadonlyMap<string, KnownHost> {
    try {
      return decode(this.#memento.get<unknown>(KNOWN_HOSTS_KEY))
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error
      }
      return new Map()
    }
  }
}

function decode(stored: unknown): ReadonlyMap<string, KnownHost> {
  if (stored === undefined) {
    return new Map()
  }
  const record = readRecord(stored)
  if (readNumber(record, 'version') !== STORAGE_VERSION) {
    return new Map()
  }
  const hosts = readArray(record, 'hosts').map((entry): KnownHost => {
    const host = readRecord(entry)
    return {
      host: readString(host, 'host'),
      port: readNumber(host, 'port'),
      fingerprint: readString(host, 'fingerprint'),
    }
  })
  return new Map(hosts.map((host) => [addressOf(host), host]))
}
