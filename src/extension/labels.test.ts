import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { environmentBadge, environmentColor } from './labels.ts'

describe('environmentColor', () => {
  it('should paint production red and staging orange', () => {
    expect(environmentColor('prod')).toStrictEqual(new vscode.ThemeColor('charts.red'))
    expect(environmentColor('staging')).toStrictEqual(new vscode.ThemeColor('charts.orange'))
    expect(environmentColor('dev')).toStrictEqual(new vscode.ThemeColor('charts.blue'))
    expect(environmentColor('local')).toStrictEqual(new vscode.ThemeColor('charts.green'))
  })

  it('should keep the theme color of an untagged connection', () => {
    expect(environmentColor('none')).toBeUndefined()
  })
})

describe('environmentBadge', () => {
  it('should shout the tag', () => {
    expect(environmentBadge('prod')).toBe('PROD')
  })

  it('should show nothing for an untagged connection', () => {
    expect(environmentBadge('none')).toBe('')
  })
})
