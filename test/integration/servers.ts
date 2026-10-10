// Where the integration tests find their servers: test/integration/compose.yaml locally, service
// containers in CI. Each value can be overridden by an environment variable.
import type { ConnectRequest, Endpoint } from '../../src/core/engine/engine.ts'

export interface DatabaseServer {
  readonly endpoint: Endpoint
  // The same server as the SSH server reaches it, inside the container network.
  readonly internal: Endpoint
  readonly user: string
  readonly password: string
  readonly database: string
}

export interface SshServer {
  readonly endpoint: Endpoint
  readonly user: string
  readonly password: string
}

const LOCALHOST = '127.0.0.1'
// Throwaway credentials of the test containers.
const TEST_SECRET = 'sqldoro-it'

const ENVIRONMENT: ReadonlyMap<string, string | undefined> = new Map(Object.entries(process.env))
const READY_TIMEOUT_MS = 90_000
const RETRY_DELAY_MS = 1000

function setting(name: string, fallback: string): string {
  const value = ENVIRONMENT.get(name)
  return value === undefined || value === '' ? fallback : value
}

function port(name: string, fallback: number): number {
  return Number(setting(name, String(fallback)))
}

export const MYSQL: DatabaseServer = {
  endpoint: {
    host: setting('SQLDORO_IT_MYSQL_HOST', LOCALHOST),
    port: port('SQLDORO_IT_MYSQL_PORT', 33_306),
  },
  internal: { host: 'mysql', port: 3306 },
  user: 'sqldoro',
  password: TEST_SECRET,
  database: 'sqldoro',
}

export const POSTGRES: DatabaseServer = {
  endpoint: {
    host: setting('SQLDORO_IT_POSTGRES_HOST', LOCALHOST),
    port: port('SQLDORO_IT_POSTGRES_PORT', 35_432),
  },
  internal: { host: 'postgres', port: 5432 },
  user: 'sqldoro',
  password: TEST_SECRET,
  database: 'sqldoro',
}

export const SSH: SshServer = {
  endpoint: {
    host: setting('SQLDORO_IT_SSH_HOST', LOCALHOST),
    port: port('SQLDORO_IT_SSH_PORT', 32_222),
  },
  user: 'root',
  password: TEST_SECRET,
}

export function connectRequest(
  server: DatabaseServer,
  changes: Partial<ConnectRequest> = {},
): ConnectRequest {
  return {
    endpoint: server.endpoint,
    user: server.user,
    password: server.password,
    database: server.database,
    tls: undefined,
    onUnexpectedClose: () => undefined,
    ...changes,
  }
}

// The servers may still be starting when the tests begin (CI health checks, docker compose up).
export async function waitUntilReady(
  probe: () => Promise<void>,
  deadline = Date.now() + READY_TIMEOUT_MS,
): Promise<void> {
  try {
    await probe()
  } catch (error) {
    if (Date.now() > deadline) {
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    await waitUntilReady(probe, deadline)
  }
}
