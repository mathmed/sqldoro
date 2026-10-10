import { cleanOutput, compareText, plural } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

const PASSED_LINE = /no dependency violations found \(([^)]+)\)/
const VIOLATION_LINE = /^\s+(?:error|warn|info) ([\w-]+): /

export function analyzeDependencyCruiser(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  if (hasPassed(fragment)) {
    const cruised = PASSED_LINE.exec(output)?.[1]
    return finding(
      Status.Ok,
      cruised === undefined ? 'All contracts kept' : `All contracts kept (${cruised})`,
    )
  }
  const rules = output
    .split('\n')
    .map((line) => VIOLATION_LINE.exec(line)?.[1])
    .filter((rule) => rule !== undefined)
  if (rules.length === 0) {
    const summary = 'dependency-cruiser failed before checking the contracts'
    return finding(Status.Failed, summary, textDetails('Output', output))
  }
  const broken = [...new Set(rules)].toSorted(compareText).map((rule) => `**${rule}**`)
  const summary = `${plural(rules.length, 'violation', 'violations')} of ${broken.join(', ')}`
  return finding(
    Status.Failed,
    summary,
    textDetails('Broken contracts and violating imports', output),
  )
}
