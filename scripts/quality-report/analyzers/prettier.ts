import { cleanOutput, plural } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

const UNFORMATTED_FILE = /^\[warn\] (?!Code style issues)(\S.*)$/

export function analyzePrettier(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  if (hasPassed(fragment)) {
    return finding(Status.Ok, 'Formatting is correct')
  }
  const files = output
    .split('\n')
    .map((line) => UNFORMATTED_FILE.exec(line)?.[1])
    .filter((file) => file !== undefined)
  if (files.length === 0) {
    return finding(Status.Failed, 'Prettier failed', textDetails('Output', output))
  }
  const summary = `${plural(files.length, 'file needs', 'files need')} formatting (\`make format\`)`
  return finding(Status.Failed, summary, textDetails('Unformatted files', files.join('\n')))
}
