import { cleanOutput } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

const ISSUE_GROUP = /^([A-Z][A-Za-z ]+) \((\d+)\)$/

export function analyzeKnip(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  if (hasPassed(fragment)) {
    return finding(Status.Ok, 'No unused files, exports or dependencies')
  }
  const groups = output
    .split('\n')
    .map((line) => ISSUE_GROUP.exec(line))
    .filter((match) => match !== null)
    .map(([, name = '', count = '']) => `${count} ${lowerFirst(name)}`)
  const summary = groups.length === 0 ? 'knip failed' : groups.join(', ')
  return finding(Status.Failed, summary, textDetails('Issues', output))
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`
}
