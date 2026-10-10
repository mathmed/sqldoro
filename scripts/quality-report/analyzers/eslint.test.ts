import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { COMPLEXITY_FAMILY, eslintAnalyzer, LINT_FAMILY, SECURITY_FAMILY } from './eslint.ts'

const PROBLEMS = `
> sqldoro@0.0.1 lint
> eslint . --max-warnings 0

src/core/probe.ts
   1:1   error  'fs' import is restricted from being used by a pattern  no-restricted-imports
   8:8   error  Function 'classify' has a complexity of 9. Maximum allowed is 5  complexity
  11:7   error  Blocks are nested too deeply (3). Maximum allowed is 2  max-depth
  12:9   error  Blocks are nested too deeply (4). Maximum allowed is 2  max-depth
  28:10  error  Found readFileSync with non literal argument at index 0  security/detect-non-literal-fs-filename

test/x.ts
  3:1  error  Parsing error: ';' expected

✖ 6 problems (6 errors, 0 warnings)
  1 error and 0 warnings potentially fixable with the \`--fix\` option.
`

function eslint(output: string, exitCode = 1): Fragment {
  return { analysis: Analysis.Eslint, exitCode, output, seconds: 1 }
}

describe('eslintAnalyzer', () => {
  it.each([
    [LINT_FAMILY, 'No lint problems'],
    [COMPLEXITY_FAMILY, 'Every function within the complexity limits'],
    [SECURITY_FAMILY, 'No security problems'],
  ])('should be ok when ESLint passes', (family, summary) => {
    expect(eslintAnalyzer(family)(eslint('', 0))).toStrictEqual({ status: Status.Ok, summary })
  })

  it('should report the complexity violations with their location', () => {
    const sut = eslintAnalyzer(COMPLEXITY_FAMILY)(eslint(PROBLEMS))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('3 complexity violations (complexity, max-depth)')
    expect(sut.details?.body).toBe(
      [
        "src/core/probe.ts:8:8 Function 'classify' has a complexity of 9. Maximum allowed is 5 [complexity]",
        'src/core/probe.ts:11:7 Blocks are nested too deeply (3). Maximum allowed is 2 [max-depth]',
        'src/core/probe.ts:12:9 Blocks are nested too deeply (4). Maximum allowed is 2 [max-depth]',
      ].join('\n'),
    )
  })

  it('should report the security problems apart from the rest', () => {
    const sut = eslintAnalyzer(SECURITY_FAMILY)(eslint(PROBLEMS))

    expect(sut.summary).toBe('1 security problem (security/detect-non-literal-fs-filename)')
    expect(sut.details?.title).toBe('Problems')
  })

  it('should count the other problems, parsing errors included, as lint problems', () => {
    const sut = eslintAnalyzer(LINT_FAMILY)(eslint(PROBLEMS))

    expect(sut.summary).toBe('2 lint problems (no-restricted-imports)')
    expect(sut.details?.body).toContain("test/x.ts:3:1 Parsing error: ';' expected")
  })

  it('should be ok for a family without problems when ESLint fails for another one', () => {
    const output = PROBLEMS.replace(/^.*security\/.*$/m, '')

    expect(eslintAnalyzer(SECURITY_FAMILY)(eslint(output)).status).toBe(Status.Ok)
  })

  it.each([
    'sonarjs/cognitive-complexity',
    'max-lines-per-function',
    '@typescript-eslint/max-params',
  ])('should count %s as complexity', (rule) => {
    const output = `src/a.ts\n  1:1  error  Too complex  ${rule}\n\n✖ 1 problem (1 error, 0 warnings)`

    expect(eslintAnalyzer(COMPLEXITY_FAMILY)(eslint(output)).summary).toBe(
      `1 complexity violation (${rule})`,
    )
  })

  it.each(['no-eval', 'sonarjs/pseudo-random', 'no-unsanitized/property'])(
    'should count %s as security',
    (rule) => {
      const output = `src/a.ts\n  1:1  error  Unsafe  ${rule}\n\n✖ 1 problem (1 error, 0 warnings)`

      expect(eslintAnalyzer(SECURITY_FAMILY)(eslint(output)).status).toBe(Status.Failed)
      expect(eslintAnalyzer(LINT_FAMILY)(eslint(output)).status).toBe(Status.Ok)
    },
  )

  it('should summarise problems without a rule by their count only', () => {
    const output =
      'src/a.ts\n  1:1  error  Parsing error: oops\n\n✖ 1 problem (1 error, 0 warnings)'

    expect(eslintAnalyzer(LINT_FAMILY)(eslint(output)).summary).toBe('1 lint problem')
  })

  it('should fail every family when ESLint crashes before reporting', () => {
    const crash = 'Oops! Something went wrong! :(\nTypeError: Cannot read config'

    const sut = eslintAnalyzer(COMPLEXITY_FAMILY)(eslint(crash, 2))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('ESLint failed before reporting')
    expect(sut.details?.body).toBe(crash)
  })
})
