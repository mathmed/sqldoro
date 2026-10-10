import { cleanOutput, compareText, plural } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

// One ESLint run enforces lint, complexity and security rules; the report splits its problems by
// family so that each family has its own section, like ruff, xenon and bandit in py-awesome.
export interface RuleFamily {
  readonly passedSummary: string
  readonly singular: string
  readonly plural: string
  readonly includes: (rule: string) => boolean
}

interface Problem {
  readonly location: string
  readonly message: string
  readonly rule: string
}

const FILE_LINE = /^\S+\.[cm]?[jt]sx?$/
const PROBLEM_LINE = /^\s+(\d+:\d+)\s+(?:error|warning)\s+(\S.*)$/
// The stylish formatter pads the message column, so the rule id follows the last double space.
const RULE_SEPARATOR = '  '
const SUMMARY_LINE = /^✖ \d+ problems? \(/m
const COMPLEXITY_RULE =
  /^(?:complexity|sonarjs\/cognitive-complexity|(?:@typescript-eslint\/)?max-[a-z-]+)$/
const SECURITY_PLUGINS = ['security/', 'no-unsanitized/']
const SECURITY_RULE_NAMES: ReadonlySet<string> = new Set([
  'no-eval',
  'no-new-func',
  'no-implied-eval',
  '@typescript-eslint/no-implied-eval',
  'sonarjs/code-eval',
  'sonarjs/hashing',
  'sonarjs/insecure-jwt-token',
  'sonarjs/no-clear-text-protocols',
  'sonarjs/no-hardcoded-passwords',
  'sonarjs/no-hardcoded-secrets',
  'sonarjs/no-os-command-from-path',
  'sonarjs/os-command',
  'sonarjs/pseudo-random',
  'sonarjs/publicly-writable-directories',
  'sonarjs/slow-regex',
  'sonarjs/sql-queries',
  'sonarjs/unverified-certificate',
  'sonarjs/weak-ssl',
])

function isComplexityRule(rule: string): boolean {
  return COMPLEXITY_RULE.test(rule)
}

function isSecurityRule(rule: string): boolean {
  return SECURITY_RULE_NAMES.has(rule) || SECURITY_PLUGINS.some((plugin) => rule.startsWith(plugin))
}

export const COMPLEXITY_FAMILY: RuleFamily = {
  passedSummary: 'Every function within the complexity limits',
  singular: 'complexity violation',
  plural: 'complexity violations',
  includes: isComplexityRule,
}

export const SECURITY_FAMILY: RuleFamily = {
  passedSummary: 'No security problems',
  singular: 'security problem',
  plural: 'security problems',
  includes: isSecurityRule,
}

export const LINT_FAMILY: RuleFamily = {
  passedSummary: 'No lint problems',
  singular: 'lint problem',
  plural: 'lint problems',
  includes: (rule) => !isComplexityRule(rule) && !isSecurityRule(rule),
}

export function eslintAnalyzer(family: RuleFamily): (fragment: Fragment) => Finding {
  return (fragment) => analyzeFamily(fragment, family)
}

function analyzeFamily(fragment: Fragment, family: RuleFamily): Finding {
  const output = cleanOutput(fragment.output)
  if (hasPassed(fragment)) {
    return finding(Status.Ok, family.passedSummary)
  }
  if (!SUMMARY_LINE.test(output)) {
    return finding(Status.Failed, 'ESLint failed before reporting', textDetails('Output', output))
  }
  const problems = parseProblems(output).filter((problem) => family.includes(problem.rule))
  if (problems.length === 0) {
    return finding(Status.Ok, family.passedSummary)
  }
  const details = problems.map(formatProblem).join('\n')
  return finding(Status.Failed, summarize(problems, family), textDetails('Problems', details))
}

function parseProblems(output: string): Problem[] {
  let file = ''
  const problems: Problem[] = []
  for (const line of output.split('\n')) {
    file = FILE_LINE.test(line) ? line : file
    const problem = parseProblem(file, line)
    if (problem !== undefined) {
      problems.push(problem)
    }
  }
  return problems
}

function parseProblem(file: string, line: string): Problem | undefined {
  const match = PROBLEM_LINE.exec(line)
  if (match === null) {
    return undefined
  }
  const [, position = '', text = ''] = match
  return { location: `${file}:${position}`, ...splitRule(text) }
}

function splitRule(text: string): Pick<Problem, 'message' | 'rule'> {
  const separator = text.lastIndexOf(RULE_SEPARATOR)
  if (separator === -1) {
    return { message: text, rule: '' }
  }
  return { message: text.slice(0, separator).trimEnd(), rule: text.slice(separator).trim() }
}

function summarize(problems: readonly Problem[], family: RuleFamily): string {
  const rules = [...new Set(problems.map(({ rule }) => rule).filter((rule) => rule !== ''))]
  const count = plural(problems.length, family.singular, family.plural)
  return rules.length === 0 ? count : `${count} (${rules.toSorted(compareText).join(', ')})`
}

function formatProblem({ location, message, rule }: Problem): string {
  return rule === '' ? `${location} ${message}` : `${location} ${message} [${rule}]`
}
