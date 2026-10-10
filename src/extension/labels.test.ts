import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import {
  ENVIRONMENT_LABELS,
  environmentBadge,
  environmentColor,
  labelOf,
  SSH_AUTH_LABELS,
  SSL_MODE_DETAILS,
  SSL_MODE_LABELS,
} from './labels.ts'

describe('labelOf', () => {
  it('should name each stored value', () => {
    expect(labelOf(ENVIRONMENT_LABELS, 'prod')).toBe('Production')
    expect(labelOf(SSL_MODE_LABELS, 'verify-ca')).toBe('Verify CA')
    expect(labelOf(SSL_MODE_DETAILS, 'disable')).toBe('Plain connection, nothing is encrypted')
    expect(labelOf(SSH_AUTH_LABELS, 'private-key')).toBe('Private key')
  })

  it('should show an unknown value as it is', () => {
    expect(labelOf(ENVIRONMENT_LABELS, 'qa')).toBe('qa')
  })
})

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
