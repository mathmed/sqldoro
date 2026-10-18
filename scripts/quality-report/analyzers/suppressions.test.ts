import { describe, expect, it } from 'vitest'

import {
  formatSuppressionsLine,
  type SuppressionChange,
  type SuppressionsResult,
} from '../../shared/suppressions-result.ts'
import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeSuppressions } from './suppressions.ts'

const MATCHING: SuppressionsResult = {
  total: 10,
  baselineTotal: 10,
  totals: [
    { kind: 'eslint-disable', count: 9 },
    { kind: 'test-skip', count: 1 },
  ],
  changes: [],
}

const ADDED: SuppressionChange = {
  path: 'src/webview/Grid.tsx',
  kind: 'eslint-disable',
  baseline: 1,
  current: 3,
  lines: [134, 140, 152],
}

const REMOVED: SuppressionChange = {
  path: 'test/vscode/tabs.ts',
  kind: 'test-skip',
  baseline: 1,
  current: 0,
  lines: [],
}

// What `npm run suppressions` prints (scripts/suppressions/cli.ts), with npm's own lines.
function suppressions(result: SuppressionsResult, exitCode: number): Fragment {
  const output = [
    '> sqldoro@0.1.3 suppressions',
    '> node scripts/suppressions.ts check',
    '',
    `Suppressions: ${String(result.total)} (baseline ${String(result.baselineTotal)})`,
    formatSuppressionsLine(result),
  ].join('\n')
  return { analysis: Analysis.Suppressions, exitCode, output, seconds: 2 }
}

describe('analyzeSuppressions', () => {
  it('should report the totals by kind when they match the baseline', () => {
    const sut = analyzeSuppressions(suppressions(MATCHING, 0))

    expect(sut).toEqual({
      status: Status.Ok,
      summary: '10 suppressions (eslint-disable 9, test-skip 1) · matches the baseline',
    })
  })

  it('should say when there is no suppression at all', () => {
    const none = { total: 0, baselineTotal: 0, totals: [], changes: [] }

    expect(analyzeSuppressions(suppressions(none, 0)).summary).toBe(
      '0 suppressions · matches the baseline',
    )
  })

  it('should fail on new suppressions and list them by file, kind and line', () => {
    const result = { ...MATCHING, total: 11, changes: [ADDED, REMOVED] }

    const sut = analyzeSuppressions(suppressions(result, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe(
      '2 new suppressions above the baseline · 11 suppressions (eslint-disable 9, test-skip 1)',
    )
    expect(sut.details?.body).toBe(
      [
        '| File | Kind | Baseline → current | Lines |',
        '| --- | --- | ---: | --- |',
        '| `src/webview/Grid.tsx` | eslint-disable | 1 → 3 | 134, 140, 152 |',
        '| `test/vscode/tabs.ts` | test-skip | 1 → 0 | - |',
      ].join('\n'),
    )
  })

  it('should fail until a lower baseline is committed when suppressions were removed', () => {
    const totals = [{ kind: 'eslint-disable', count: 9 }]
    const result = { ...MATCHING, total: 9, totals, changes: [REMOVED] }

    const sut = analyzeSuppressions(suppressions(result, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe(
      '1 suppression removed: lower the baseline with `make suppressions-update` · 9 suppressions (eslint-disable 9)',
    )
  })

  it('should list at most 50 changes', () => {
    const changes = Array.from({ length: 52 }, (...[, index]) => ({ ...ADDED, lines: [index] }))

    const sut = analyzeSuppressions(suppressions({ ...MATCHING, changes }, 1))

    expect(sut.details?.body.split('\n')).toHaveLength(2 + 50 + 2)
    expect(sut.details?.body).toContain('... and 2 more: run `make suppressions`.')
  })

  it('should fail with the output when the check crashed before its result', () => {
    const fragment = {
      analysis: Analysis.Suppressions,
      exitCode: 1,
      output: 'SyntaxError: Unexpected token',
      seconds: 1,
    }

    const sut = analyzeSuppressions(fragment)

    expect(sut).toEqual({
      status: Status.Failed,
      summary: 'the suppression check failed before producing a result',
      details: { title: 'Output', body: 'SyntaxError: Unexpected token', format: 'text' },
    })
  })
})
