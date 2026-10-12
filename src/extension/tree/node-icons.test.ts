import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { EXTENSION_URI } from '../../../test/support/explorer.ts'
import { engineGlyph, NodeIcon, SELECTED_COLOR, selectedIcon, themeIcon } from './node-icons.ts'

// The theme colors that have a value of their own in the light, dark and high-contrast themes.
const THEMED_COLORS: ReadonlySet<string> = new Set([
  'charts.blue',
  'charts.green',
  'charts.orange',
  'charts.purple',
  'charts.yellow',
  'symbolIcon.fieldForeground',
  'symbolIcon.folderForeground',
])

describe('NodeIcon', () => {
  it('should paint every kind of node with a codicon in a theme color', () => {
    for (const look of Object.values(NodeIcon)) {
      expect(look.id).toMatch(/^[a-z-]+$/)
      expect(THEMED_COLORS.has(look.color)).toBe(true)
    }
  })

  it('should give each family its color, and the primary keys gold', () => {
    expect(NodeIcon.Tables).toStrictEqual(NodeIcon.Table)
    expect(NodeIcon.Views).toStrictEqual(NodeIcon.View)
    expect(NodeIcon.Columns).toStrictEqual(NodeIcon.Column)
    expect(NodeIcon.Indexes).toStrictEqual(NodeIcon.Index)
    expect(NodeIcon.ForeignKeys).toStrictEqual(NodeIcon.ForeignKey)
    expect(new Set([NodeIcon.Table.color, NodeIcon.View.color, NodeIcon.Column.color]).size).toBe(3)
    expect(NodeIcon.PrimaryKey).toStrictEqual({ id: 'key', color: 'charts.yellow' })
  })

  it('should keep the accent of the selected database for it alone', () => {
    expect(Object.values(NodeIcon).map((look) => look.color)).not.toContain(SELECTED_COLOR)
  })
})

describe('themeIcon', () => {
  it('should make a codicon in its theme color', () => {
    expect(themeIcon(NodeIcon.Database)).toStrictEqual(
      new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.yellow')),
    )
  })

  it('should make the same codicon in the accent for the selected database', () => {
    expect(selectedIcon(NodeIcon.Schema)).toStrictEqual(
      new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('charts.green')),
    )
  })
})

describe('engineGlyph', () => {
  it('should give the light and dark glyph of an engine, with the dot once connected', () => {
    expect(engineGlyph(EXTENSION_URI, 'mysql', true)).toStrictEqual({
      light: vscode.Uri.file('/extension/media/explorer/mysql-connected-light.svg'),
      dark: vscode.Uri.file('/extension/media/explorer/mysql-connected-dark.svg'),
    })
    expect(engineGlyph(EXTENSION_URI, 'postgres', false)).toStrictEqual({
      light: vscode.Uri.file('/extension/media/explorer/postgres-disconnected-light.svg'),
      dark: vscode.Uri.file('/extension/media/explorer/postgres-disconnected-dark.svg'),
    })
  })

  it('should point at glyphs the extension ships', () => {
    const root = vscode.Uri.file(fileURLToPath(new URL('../../../', import.meta.url)))
    const files = ['mysql', 'postgres'].flatMap((engine) =>
      [true, false].flatMap((isConnected) => {
        const glyph = engineGlyph(root, engine, isConnected)
        return glyph === undefined ? [] : [glyph.light.fsPath, glyph.dark.fsPath]
      }),
    )

    expect(files).toHaveLength(8)
    for (const file of files) {
      expect(existsSync(file)).toBe(true)
    }
  })

  it('should give nothing for an engine without a glyph', () => {
    expect(engineGlyph(EXTENSION_URI, 'oracle', true)).toBeUndefined()
  })
})
