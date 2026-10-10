// Every command the extension contributes in package.json (contributes.commands).
export const CommandId = {
  Hello: 'sqldoro.hello',
  AddConnection: 'sqldoro.addConnection',
  ImportConnectionUrl: 'sqldoro.importConnectionUrl',
  EditConnection: 'sqldoro.editConnection',
  DuplicateConnection: 'sqldoro.duplicateConnection',
  DeleteConnection: 'sqldoro.deleteConnection',
  TestConnection: 'sqldoro.testConnection',
  Connect: 'sqldoro.connect',
  Disconnect: 'sqldoro.disconnect',
  Refresh: 'sqldoro.refresh',
  Filter: 'sqldoro.filter',
  ClearFilter: 'sqldoro.clearFilter',
} as const

export type CommandId = (typeof CommandId)[keyof typeof CommandId]

export const ViewId = {
  Connections: 'sqldoro.connections',
} as const

export const ContextKey = {
  IsFiltered: 'sqldoro.isFiltered',
} as const
