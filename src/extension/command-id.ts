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
  NewQuery: 'sqldoro.newQuery',
  ChangeConnection: 'sqldoro.changeConnection',
  RunQuery: 'sqldoro.runQuery',
  RunScript: 'sqldoro.runScript',
  CancelQuery: 'sqldoro.cancelQuery',
  Explain: 'sqldoro.explain',
  ExplainAnalyze: 'sqldoro.explainAnalyze',
  ShowResults: 'sqldoro.showResults',
  ShowDdl: 'sqldoro.showDdl',
  SearchHistory: 'sqldoro.searchHistory',
  OpenHistoryEntry: 'sqldoro.openHistoryEntry',
  RunHistoryEntry: 'sqldoro.runHistoryEntry',
  CopyHistoryEntry: 'sqldoro.copyHistoryEntry',
  DeleteHistoryEntry: 'sqldoro.deleteHistoryEntry',
  ClearHistory: 'sqldoro.clearHistory',
  SaveQuery: 'sqldoro.saveQuery',
  OpenSavedQuery: 'sqldoro.openSavedQuery',
  InsertSavedQuery: 'sqldoro.insertSavedQuery',
  RenameSavedQuery: 'sqldoro.renameSavedQuery',
  MoveSavedQuery: 'sqldoro.moveSavedQuery',
  DeleteSavedQuery: 'sqldoro.deleteSavedQuery',
  ImportSavedQueries: 'sqldoro.importSavedQueries',
  ExportSavedQueries: 'sqldoro.exportSavedQueries',
} as const

export type CommandId = (typeof CommandId)[keyof typeof CommandId]

export const ViewId = {
  Connections: 'sqldoro.connections',
  History: 'sqldoro.history',
  SavedQueries: 'sqldoro.savedQueries',
} as const

export const ContextKey = {
  IsFiltered: 'sqldoro.isFiltered',
  EditorHasConnection: 'sqldoro.editorHasConnection',
  IsQueryRunning: 'sqldoro.isQueryRunning',
} as const

// The language of the documents sqldoro runs.
export const SQL_LANGUAGE = 'sql'
