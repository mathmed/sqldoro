import * as vscode from 'vscode'

import { EnvironmentTag } from '../core/connection/connection.ts'
import { ENVIRONMENT_COLORS } from '../core/connection/labels.ts'

export function environmentColor(tag: string): vscode.ThemeColor | undefined {
  const color = ENVIRONMENT_COLORS.get(tag)
  return color === undefined ? undefined : new vscode.ThemeColor(color)
}

// The badge shown next to a tagged connection, such as PROD.
export function environmentBadge(tag: string): string {
  return tag === EnvironmentTag.None ? '' : tag.toUpperCase()
}
