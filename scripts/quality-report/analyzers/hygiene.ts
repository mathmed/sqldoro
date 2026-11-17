import { cleanOutput } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

const VERDICT_PREFIX = 'File hygiene: '
// "File hygiene: 612 files checked, no problem." or "..., 3 problems (`make format` fixes ...)."
const VERDICT = /^File hygiene: ([^(.]+)/m
// "src/a.ts:1: trailing whitespace", "big.zip: 2mb added, above the 500kb limit"
const PROBLEM_SEPARATOR = ': '

export function analyzeHygiene(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const verdict = VERDICT.exec(output)?.[1]?.trim()
  if (verdict === undefined) {
    return finding(Status.Failed, 'the hygiene check failed', textDetails('Output', output))
  }
  if (hasPassed(fragment)) {
    return finding(Status.Ok, upperFirst(verdict))
  }
  const problems = output
    .split('\n')
    .filter((line) => line.includes(PROBLEM_SEPARATOR) && !line.startsWith(VERDICT_PREFIX))
  return finding(Status.Failed, upperFirst(verdict), textDetails('Problems', problems.join('\n')))
}

function upperFirst(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}
