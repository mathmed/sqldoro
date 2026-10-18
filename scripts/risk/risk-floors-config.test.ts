import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { readText } from '../shared/files.ts'
import { assess, parseFloors } from './floors.ts'
import { RiskLevel } from './levels.ts'

const CONFIG = fileURLToPath(new URL('../../.github/risk-floors.yaml', import.meta.url))

// The committed floors: the categories every PR is held to.
describe('.github/risk-floors.yaml', () => {
  async function categoriesOf(file: string): Promise<string[]> {
    const floors = parseFloors(await readText(CONFIG))
    return assess([file], floors).hits.map((hit) => hit.category)
  }

  it('should keep every category at high or above', async () => {
    const floors = parseFloors(await readText(CONFIG))

    expect(floors.map((floor) => floor.category)).toEqual([
      'pipeline config',
      'storage schema',
      'auth and secrets',
      'destructive SQL safety',
    ])
    expect(floors.every((floor) => floor.level === RiskLevel.High)).toBe(true)
  })

  it.each([
    'package.json',
    'package-lock.json',
    'Makefile',
    'lefthook.yml',
    'eslint.config.ts',
    'tsconfig.json',
    'src/webview/tsconfig.json',
    'vitest.config.ts',
    'stryker.config.mjs',
    '.dependency-cruiser.mjs',
    'knip.jsonc',
    'suppressions-baseline.json',
    'scripts/risk/cli.ts',
    'test/smoke/suite.ts',
    '.github/workflows/ci.yml',
    '.github/risk-floors.yaml',
    '.claude/agents/coder.md',
    'CLAUDE.md',
    'AGENTS.md',
  ])('should hold %s as pipeline config', async (file) => {
    expect(await categoriesOf(file)).toContain('pipeline config')
  })

  it.each([
    'src/extension/storage/connection-store.ts',
    'src/extension/history/history-store.ts',
    'src/extension/snippets/saved-query-store.ts',
    'src/core/json/versioned-list.ts',
    'src/core/connection/codec.ts',
  ])('should hold %s as storage schema', async (file) => {
    expect(await categoriesOf(file)).toContain('storage schema')
  })

  it.each([
    'src/extension/storage/secret-store.ts',
    'src/core/connection/secrets.ts',
    'src/webview/connection-form/SecretField.tsx',
    'src/core/connection/tls.ts',
    'src/core/session/host-key.ts',
    'src/tunnel/ssh-tunnel.ts',
    'src/drivers/postgres/postgres-connection.ts',
  ])('should hold %s as auth and secrets', async (file) => {
    expect(await categoriesOf(file)).toContain('auth and secrets')
  })

  it.each([
    'src/core/safety/guard.ts',
    'src/extension/safety/statement-guard.ts',
    'src/core/edits/statements.ts',
    'src/core/sql/statements.ts',
    'src/drivers/mysql/mysql-dialect.ts',
    'src/extension/editor/query-runner.ts',
    'src/extension/transactions/transaction-commands.ts',
  ])('should hold %s as destructive SQL safety', async (file) => {
    expect(await categoriesOf(file)).toContain('destructive SQL safety')
  })

  it.each(['README.md', 'src/webview/Grid.tsx', 'src/core/results/tabs.ts', 'media/icon.png'])(
    'should not raise the floor of %s',
    async (file) => {
      expect(await categoriesOf(file)).toEqual([])
    },
  )
})
