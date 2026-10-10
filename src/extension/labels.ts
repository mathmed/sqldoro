import * as vscode from 'vscode'

import { EnvironmentTag } from '../core/connection/connection.ts'

// Production stands out in red; untagged connections keep the theme's color.
const ENVIRONMENT_COLORS: ReadonlyMap<string, string> = new Map([
  [EnvironmentTag.Local, 'charts.green'],
  [EnvironmentTag.Development, 'charts.blue'],
  [EnvironmentTag.Staging, 'charts.orange'],
  [EnvironmentTag.Production, 'charts.red'],
])

export function environmentColor(tag: string): vscode.ThemeColor | undefined {
  const color = ENVIRONMENT_COLORS.get(tag)
  return color === undefined ? undefined : new vscode.ThemeColor(color)
}

// The badge shown next to a tagged connection, such as PROD.
export function environmentBadge(tag: string): string {
  return tag === EnvironmentTag.None ? '' : tag.toUpperCase()
}
