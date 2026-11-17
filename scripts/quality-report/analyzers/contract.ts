import { cleanOutput } from '../../shared/text.ts'
import { finding, type Finding, markdownDetails, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

const VERDICT_PREFIX = 'Contract: '
const CHANGE_PREFIXES: readonly string[] = ['Breaking: ', 'Added: ']
const SENTENCE_END = '.'

export function analyzeContract(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const lines = output.split('\n')
  const verdict = lines.find((line) => line.startsWith(VERDICT_PREFIX))
  if (verdict === undefined) {
    return finding(Status.Failed, 'the contract check failed', textDetails('Output', output))
  }
  const summary = verdict.slice(VERDICT_PREFIX.length).replace(SENTENCE_END, '')
  const changes = lines
    .filter((line) => CHANGE_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .map((line) => `- ${line}`)
  const status = hasPassed(fragment) ? Status.Ok : Status.Failed
  return finding(status, summary, markdownDetails('Contract changes', changes.join('\n')))
}
