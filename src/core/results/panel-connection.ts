import { type ConnectionConfig, EnvironmentTag } from '../connection/connection.ts'
import { type GuardPolicy, isProduction } from '../safety/guard.ts'
import type { PanelConnection } from './protocol.ts'

const SEPARATOR = ' · '

// What the result view shows of the connection of its editor.
export function panelConnection(
  connection: ConnectionConfig,
  policy: GuardPolicy,
): PanelConnection {
  return {
    name: connection.name,
    environment: connection.environment === EnvironmentTag.None ? '' : connection.environment,
    isProduction: isProduction(connection.environment, policy),
    isReadOnly: connection.isReadOnly,
  }
}

// "PROD · Shop · read-only": the environment first, so that production cannot be missed.
export function connectionText(connection: PanelConnection): string {
  return [
    connection.environment.toUpperCase(),
    connection.name,
    connection.isReadOnly ? 'read-only' : 'writes allowed',
  ]
    .filter((part) => part !== '')
    .join(SEPARATOR)
}

// The title of a result panel, with the environment of its connection when it has one.
export function panelTitle(title: string, connection: PanelConnection): string {
  return connection.environment === ''
    ? title
    : `${title}${SEPARATOR}${connection.environment.toUpperCase()}`
}
