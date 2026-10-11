import { type ConnectionConfig, EnvironmentTag } from '../connection/connection.ts'
import { connectionTint } from '../connection/labels.ts'
import { type GuardPolicy, isProduction } from '../safety/guard.ts'
import type { PanelConnection } from './protocol.ts'

const SEPARATOR = ' · '

// What the result view shows of the connection of its editor.
export function panelConnection(
  connection: ConnectionConfig,
  policy: GuardPolicy,
): PanelConnection {
  const isOnProduction = isProduction(connection.environment, policy)
  return {
    name: connection.name,
    environment: connection.environment === EnvironmentTag.None ? '' : connection.environment,
    isProduction: isOnProduction,
    isReadOnly: connection.isReadOnly,
    color: connectionTint(connection, isOnProduction),
  }
}

// "PROD · Shop": the environment first, so that production cannot be missed. Whether it writes
// shows apart, once, as the lock of the panel.
export function connectionText(connection: PanelConnection): string {
  return [connection.environment.toUpperCase(), connection.name]
    .filter((part) => part !== '')
    .join(SEPARATOR)
}

// The title of a result panel, with the environment of its connection when it has one.
export function panelTitle(title: string, connection: PanelConnection): string {
  return connection.environment === ''
    ? title
    : `${title}${SEPARATOR}${connection.environment.toUpperCase()}`
}
