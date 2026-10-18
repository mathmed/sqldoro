import { describe, expect, it } from 'vitest'

import { SuppressionKind } from './kinds.ts'
import { compareOccurrences, scanSource } from './scan.ts'

function kindsIn(path: string, source: string): [number, string][] {
  return scanSource(path, source).map(({ line, kind }) => [line, kind])
}

describe('scanSource', () => {
  it('should count every lint, type, coverage, mutation, format and knip suppression comment', () => {
    const source = [
      '// eslint-disable-next-line no-console -- reason',
      'console.log(1) // eslint-disable-line no-console -- reason',
      '/* eslint-disable no-alert -- reason */',
      '/* eslint no-console: "off" */',
      '// @ts-ignore',
      '// @ts-expect-error: the reason',
      '// @ts-nocheck',
      '/* v8 ignore next */ /* c8 ignore start */ // istanbul ignore else',
      '// Stryker disable next-line all: reason',
      '// prettier-ignore',
      '/** @public */ /** @beta */ /** @alias */ /** @internal */',
      'export const value = 1',
    ].join('\n')

    expect(kindsIn('src/a.ts', source)).toEqual([
      [1, SuppressionKind.EslintDisable],
      [2, SuppressionKind.EslintDisable],
      [3, SuppressionKind.EslintDisable],
      [4, SuppressionKind.EslintConfig],
      [5, SuppressionKind.TsIgnore],
      [6, SuppressionKind.TsExpectError],
      [7, SuppressionKind.TsNocheck],
      [8, SuppressionKind.CoverageIgnore],
      [8, SuppressionKind.CoverageIgnore],
      [8, SuppressionKind.CoverageIgnore],
      [9, SuppressionKind.StrykerDisable],
      [10, SuppressionKind.PrettierIgnore],
      [11, SuppressionKind.KnipTag],
      [11, SuppressionKind.KnipTag],
      [11, SuppressionKind.KnipTag],
      [11, SuppressionKind.KnipTag],
    ])
  })

  it('should count each directive of a comment that holds several', () => {
    const source = '/* eslint-disable a -- r */ /* eslint-disable-line b, eslint-disable c */\n'

    expect(kindsIn('src/a.ts', source)).toEqual([
      [1, SuppressionKind.EslintDisable],
      [1, SuppressionKind.EslintDisable],
      [1, SuppressionKind.EslintDisable],
    ])
  })

  it('should not count the same words in strings, templates, regular expressions or plain comments', () => {
    const source = [
      "const a = '// eslint-disable-next-line'",
      'const b = `/* @ts-ignore */ ${a} it.skip`',
      'const c = /eslint-disable/u',
      '// a comment about eslint and the istanbul library, eslint-enable and ts-ignore',
      '/* eslint-enable no-console */',
      'const d = { skip: true, only: false }.skip',
    ].join('\n')

    expect(kindsIn('src/a.ts', source)).toEqual([])
  })

  it('should read the comments of JSX in tsx files, but not the text of the elements', () => {
    const source = [
      'export const view = (',
      '  <div>',
      '    {/* eslint-disable-next-line react/jsx-key -- reason */}',
      '    // eslint-disable-next-line is text here',
      '  </div>',
      ')',
    ].join('\n')

    expect(kindsIn('src/webview/View.tsx', source)).toEqual([[3, SuppressionKind.EslintDisable]])
  })

  it('should count any reference to a skipped test and any skip call on a test context', () => {
    const source =
      "const skipped = it.skip.each; runner.skip(); it('a', ({ task }) => task.skip())\n"

    expect(kindsIn('src/a.test.ts', source)).toEqual([
      [1, SuppressionKind.TestSkip],
      [1, SuppressionKind.TestSkip],
      [1, SuppressionKind.TestSkip],
    ])
  })

  it('should count the tests that are skipped, expected to fail or focused', () => {
    const source = [
      "it.skip('a', () => {})",
      "test.skipIf(isWindows)('b', () => {})",
      "describe.runIf(isLinux)('c', () => {})",
      "it.todo('d')",
      "test.fails('e', () => {})",
      "describe.only('f', () => {})",
      "it.concurrent.skip('g', () => {})",
      "describe.each([1])('h', () => {}).skip",
      "suite.skip('i', () => {}); bench.only('j', () => {})",
      "xit('k', () => {}); xtest('l', () => {}); xdescribe('m', () => {})",
      "fit('n', () => {}); fdescribe('o', () => {})",
      "it('p', (context) => { context.skip() })",
    ].join('\n')

    expect(kindsIn('src/a.test.ts', source)).toEqual([
      [1, SuppressionKind.TestSkip],
      [2, SuppressionKind.TestSkip],
      [3, SuppressionKind.TestSkip],
      [4, SuppressionKind.TestSkip],
      [5, SuppressionKind.TestFails],
      [6, SuppressionKind.TestFocus],
      [7, SuppressionKind.TestSkip],
      [8, SuppressionKind.TestSkip],
      [9, SuppressionKind.TestSkip],
      [9, SuppressionKind.TestFocus],
      [10, SuppressionKind.TestSkip],
      [10, SuppressionKind.TestSkip],
      [10, SuppressionKind.TestSkip],
      [11, SuppressionKind.TestFocus],
      [11, SuppressionKind.TestFocus],
      [12, SuppressionKind.TestSkip],
    ])
  })

  it('should not count running tests, computed or unrelated members and other calls', () => {
    const source = [
      "it('a', () => {}); test.each([1])('b', () => {}); describe.concurrent('c', () => {})",
      "it['skip']('d', () => {}); options.only; list.skip; run(); new Runner().skip",
      'fixture.it.only; it?.[name]; it.skipped; describe.onlyOnce; test.each.fails',
    ].join('\n')

    expect(kindsIn('src/a.test.ts', source)).toEqual([[3, SuppressionKind.TestFails]])
  })

  it('should give the path and order the suppressions by line, then by kind', () => {
    const sut = scanSource('test/a.ts', "it.only('a', () => {}) // @ts-ignore\n")

    expect(sut).toEqual([
      { path: 'test/a.ts', line: 1, kind: SuppressionKind.TsIgnore },
      { path: 'test/a.ts', line: 1, kind: SuppressionKind.TestFocus },
    ])
  })

  it('should fail on a file that may hold a suppression but does not parse', () => {
    expect(() => scanSource('src/broken.ts', 'const = it.only')).toThrow(
      'Variable declaration expected',
    )
  })

  it('should not parse a file that holds none of the words of a suppression', () => {
    expect(scanSource('src/plain.ts', 'const = 1 // fits only in one place')).toEqual([])
  })
})

describe('compareOccurrences', () => {
  it('should order by path, then by line, then by kind', () => {
    const sut = [
      { path: 'b.ts', line: 1, kind: SuppressionKind.TsIgnore },
      { path: 'a.ts', line: 2, kind: SuppressionKind.TsIgnore },
      { path: 'a.ts', line: 1, kind: SuppressionKind.TestSkip },
      { path: 'a.ts', line: 1, kind: SuppressionKind.EslintDisable },
    ].toSorted(compareOccurrences)

    expect(sut).toEqual([
      { path: 'a.ts', line: 1, kind: SuppressionKind.EslintDisable },
      { path: 'a.ts', line: 1, kind: SuppressionKind.TestSkip },
      { path: 'a.ts', line: 2, kind: SuppressionKind.TsIgnore },
      { path: 'b.ts', line: 1, kind: SuppressionKind.TsIgnore },
    ])
  })
})
