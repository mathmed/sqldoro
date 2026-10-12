import * as vscode from 'vscode'

// A codicon and the theme color it is painted in. Only theme colors: each has a value for the
// light, dark and high-contrast themes, and a theme can change it.
export interface IconLook {
  readonly id: string
  readonly color: string
}

// The icon of each kind of node of the Connections view. Each family has its color (the tables
// blue, the views orange, the keys gold), so that a kind is told at a glance. Folders keep the
// color of the text: at the top of the view, color belongs to the connections.
export const NodeIcon = {
  Folder: { id: 'folder', color: 'symbolIcon.folderForeground' },
  Database: { id: 'database', color: 'charts.yellow' },
  Schema: { id: 'symbol-namespace', color: 'charts.purple' },
  Tables: { id: 'table', color: 'charts.blue' },
  Table: { id: 'table', color: 'charts.blue' },
  Views: { id: 'eye', color: 'charts.orange' },
  View: { id: 'eye', color: 'charts.orange' },
  Columns: { id: 'symbol-field', color: 'symbolIcon.fieldForeground' },
  Column: { id: 'symbol-field', color: 'symbolIcon.fieldForeground' },
  PrimaryKey: { id: 'key', color: 'charts.yellow' },
  Indexes: { id: 'list-ordered', color: 'charts.purple' },
  Index: { id: 'list-ordered', color: 'charts.purple' },
  ForeignKeys: { id: 'references', color: 'charts.orange' },
  ForeignKey: { id: 'references', color: 'charts.orange' },
} as const satisfies Readonly<Record<string, IconLook>>

// The database (and schema) the SQL editor in front runs on: its icon and its label.
export const SELECTED_COLOR = 'charts.green'

const MEDIA_FOLDER = ['media', 'explorer'] as const
// The engines sqldoro draws a glyph for; any other shows a codicon.
const ENGINES_WITH_GLYPHS: ReadonlySet<string> = new Set(['mysql', 'postgres'])

export function themeIcon(look: IconLook): vscode.ThemeIcon {
  return new vscode.ThemeIcon(look.id, new vscode.ThemeColor(look.color))
}

export function selectedIcon(look: IconLook): vscode.ThemeIcon {
  return themeIcon({ ...look, color: SELECTED_COLOR })
}

export interface Glyph {
  readonly light: vscode.Uri
  readonly dark: vscode.Uri
}

// The glyph of an engine (a database drawn in the color of the engine) with a green dot once
// connected; undefined for an engine without a glyph.
export function engineGlyph(
  extensionUri: vscode.Uri,
  engine: string,
  isConnected: boolean,
): Glyph | undefined {
  if (!ENGINES_WITH_GLYPHS.has(engine)) {
    return undefined
  }
  const state = isConnected ? 'connected' : 'disconnected'
  const file = (theme: string): vscode.Uri =>
    vscode.Uri.joinPath(extensionUri, ...MEDIA_FOLDER, `${engine}-${state}-${theme}.svg`)
  return { light: file('light'), dark: file('dark') }
}
