import { cleanOutput, linesMatching, plural } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

const TYPE_ERROR = /\berror TS\d+:/

export function analyzeTsc(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  if (hasPassed(fragment)) {
    return finding(Status.Ok, 'No type errors')
  }
  const errors = linesMatching(TYPE_ERROR, output)
  if (errors.length === 0) {
    return finding(Status.Failed, 'tsc failed', textDetails('Output', output))
  }
  const summary = plural(errors.length, 'type error', 'type errors')
  return finding(Status.Failed, summary, textDetails('Type errors', errors.join('\n')))
}
