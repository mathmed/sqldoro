import { cleanOutput, linesMatching, orElse, plural } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

// Lines printed by scripts/smoke.ts and test/smoke/suite.ts; VS Code's own log is noise here.
const REPORT_LINE = /^>> /
const VERSION_LINE = /^>> VS Code (\S+)$/m
const ACTIVATED_LINE = /^>> extension \S+ activated in ([\d.]+)s$/m
const COMMANDS_LINE = /^>> contributed commands registered: (\d+)$/m
const VIEWS_LINE = /^>> contributed views registered: (\d+)$/m
const RESULT_VIEW_LINE = /^>> result view loaded in ([\d.]+)s$/m
const CONNECTION_FORM_LINE = /^>> connection form loaded in ([\d.]+)s$/m
const SEARCH_BOX_LINE = /^>> search box loaded in ([\d.]+)s$/m
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
  const activation = `${activationTime(output)}${hostVersion(output)}`
  const registered = [
    countOf(COMMANDS_LINE, output, ['contributed command', 'contributed commands']),
    countOf(VIEWS_LINE, output, ['contributed view', 'contributed views']),
  ].filter((count) => count !== '')
  const parts = [
    activation,
    registered.length === 0 ? '' : `${registered.join(' and ')} registered`,
    loadTime(RESULT_VIEW_LINE, output, 'result view'),
    loadTime(CONNECTION_FORM_LINE, output, 'connection form'),
    loadTime(SEARCH_BOX_LINE, output, 'search box'),
  ]
  return parts.filter((part) => part !== '').join(' · ')
}

function loadTime(line: RegExp, output: string, webview: string): string {
  const seconds = line.exec(output)?.[1]
  return seconds === undefined ? '' : `${webview} loaded in ${seconds}s`
}

function countOf(
  line: RegExp,
  output: string,
  [singular, pluralForm]: readonly [string, string],
): string {
  const count = line.exec(output)?.[1]
  return count === undefined ? '' : plural(Number(count), singular, pluralForm)
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
