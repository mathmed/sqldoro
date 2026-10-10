import { cleanOutput, linesMatching, orElse, plural } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

// Lines printed by scripts/smoke.ts and test/smoke/suite.ts; VS Code's own log is noise here.
const REPORT_LINE = /^>> /
const VERSION_LINE = /^>> VS Code (\S+)$/m
const ACTIVATED_LINE = /^>> extension \S+ activated in ([\d.]+)s$/m
const COMMANDS_LINE = /^>> contributed commands registered: (\d+)$/m
const SUITE_FAILURE = /^>> smoke: (\S.*)$/m
const LAUNCH_FAILURE = /^>> smoke FAILED: (\S.*)$/m

export function analyzeSmoke(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  if (hasPassed(fragment)) {
    return finding(Status.Ok, passedSummary(output))
  }
  const log = orElse(linesMatching(REPORT_LINE, output).join('\n'), output)
  return finding(Status.Failed, failedSummary(output), textDetails('Smoke log', log))
}

function passedSummary(output: string): string {
  const commands = COMMANDS_LINE.exec(output)?.[1]
  const activation = `${activationTime(output)}${hostVersion(output)}`
  if (commands === undefined) {
    return activation
  }
  const registered = plural(Number(commands), 'contributed command', 'contributed commands')
  return `${activation} · ${registered} registered`
}

function activationTime(output: string): string {
  const seconds = ACTIVATED_LINE.exec(output)?.[1]
  return seconds === undefined ? 'Activated' : `Activated in ${seconds}s`
}

function hostVersion(output: string): string {
  const version = VERSION_LINE.exec(output)?.[1]
  return version === undefined ? '' : ` on VS Code ${version}`
}

function failedSummary(output: string): string {
  const reason = failureReason(output)
  if (!VERSION_LINE.test(output)) {
    return `VS Code did not run the smoke suite: ${reason}`
  }
  if (!ACTIVATED_LINE.test(output)) {
    return `Extension did not activate: ${reason}`
  }
  return `Extension activated but a check failed: ${reason}`
}

function failureReason(output: string): string {
  const reason = SUITE_FAILURE.exec(output) ?? LAUNCH_FAILURE.exec(output)
  return reason?.[1] ?? 'no reason reported'
}
