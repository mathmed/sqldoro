export const SuppressionKind = {
  EslintDisable: 'eslint-disable',
  EslintConfig: 'eslint-config',
  TsIgnore: 'ts-ignore',
  TsExpectError: 'ts-expect-error',
  TsNocheck: 'ts-nocheck',
  CoverageIgnore: 'coverage-ignore',
  StrykerDisable: 'stryker-disable',
  PrettierIgnore: 'prettier-ignore',
  KnipTag: 'knip-tag',
  TestSkip: 'test-skip',
  TestFails: 'test-fails',
  TestFocus: 'test-focus',
} as const

export type SuppressionKind = (typeof SuppressionKind)[keyof typeof SuppressionKind]

const KINDS: readonly SuppressionKind[] = Object.values(SuppressionKind)

export function isSuppressionKind(value: string): value is SuppressionKind {
  return KINDS.some((kind) => kind === value)
}

export function kindOrder(kind: SuppressionKind): number {
  return KINDS.indexOf(kind)
}

interface CommentRule {
  readonly kind: SuppressionKind
  readonly pattern: RegExp
}

// Matched against the text of every comment; each match is one suppression. Knip never reports an
// export whose JSDoc carries one of the tags of the last rule (the internal one in production mode).
export const COMMENT_RULES: readonly CommentRule[] = [
  { kind: SuppressionKind.EslintDisable, pattern: /\beslint-disable(?:-next-line|-line)?\b/gu },
  { kind: SuppressionKind.EslintConfig, pattern: /^\s*eslint\s+[@\w/-]+\s*:/gu },
  { kind: SuppressionKind.TsIgnore, pattern: /@ts-ignore\b/gu },
  { kind: SuppressionKind.TsExpectError, pattern: /@ts-expect-error\b/gu },
  { kind: SuppressionKind.TsNocheck, pattern: /@ts-nocheck\b/gu },
  { kind: SuppressionKind.CoverageIgnore, pattern: /\b(?:v8|c8|istanbul)\s+ignore\b/giu },
  { kind: SuppressionKind.StrykerDisable, pattern: /\bstryker\s+disable\b/giu },
  { kind: SuppressionKind.PrettierIgnore, pattern: /\bprettier-ignore\b/gu },
  { kind: SuppressionKind.KnipTag, pattern: /@(?:public|beta|alias|internal)\b/gu },
]

// Test functions of Vitest (and the Jest-style globals) and the modifiers that keep a test from
// running, expect it to fail or skip every other test.
export const TEST_FUNCTIONS: ReadonlySet<string> = new Set([
  'it',
  'test',
  'describe',
  'suite',
  'bench',
])

export const TEST_MODIFIERS: ReadonlyMap<string, SuppressionKind> = new Map([
  ['skip', SuppressionKind.TestSkip],
  ['skipIf', SuppressionKind.TestSkip],
  ['runIf', SuppressionKind.TestSkip],
  ['todo', SuppressionKind.TestSkip],
  ['fails', SuppressionKind.TestFails],
  ['only', SuppressionKind.TestFocus],
])

export const TEST_ALIASES: ReadonlyMap<string, SuppressionKind> = new Map([
  ['xit', SuppressionKind.TestSkip],
  ['xtest', SuppressionKind.TestSkip],
  ['xdescribe', SuppressionKind.TestSkip],
  ['fit', SuppressionKind.TestFocus],
  ['fdescribe', SuppressionKind.TestFocus],
])

// `context.skip()` inside a test.
export const CONTEXT_SKIP = 'skip'

// Text every suppression above contains (a member is reached through a dot). Parsing is the slow
// part of the scan: a file none of these match holds no suppression and is not parsed.
const COMMENT_CANDIDATE = /eslint|@ts-|ignore|stryker|@(?:public|beta|alias|internal)\b/iu
const TEST_CANDIDATE =
  /\.\s*(?:skip|skipIf|runIf|todo|fails|only)\b|\b(?:xit|xtest|xdescribe|fit|fdescribe)\b/u

export function mayHoldSuppressions(source: string): boolean {
  return COMMENT_CANDIDATE.test(source) || TEST_CANDIDATE.test(source)
}
