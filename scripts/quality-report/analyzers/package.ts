import { cleanOutput, linesMatching, plural } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

// Lines printed by scripts/package.ts after vsce packed the extension.
const PACKAGE_LINE = /^>> package (\S+\.vsix): (\S+), (\d+) files, sha256 ([0-9a-f]{64})$/m
const FILE_LINE = /^>> package file /
const PROBLEM_LINE = /^>> package problem: /
const SHORT_HASH = 12

export function analyzePackage(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const packed = PACKAGE_LINE.exec(output)
  if (packed === null) {
    return finding(
      Status.Failed,
      'vsce could not pack the extension',
      textDetails('Output', output),
    )
  }
  const summary = describePackage(packed)
  const problems = stripped(PROBLEM_LINE, output)
  if (problems.length > 0) {
    const count = plural(problems.length, 'package problem', 'package problems')
    return finding(
      Status.Failed,
      `${count} in ${summary}`,
      textDetails('Problems', problems.join('\n')),
    )
  }
  if (!hasPassed(fragment)) {
    return finding(Status.Failed, `Packing failed after ${summary}`, textDetails('Output', output))
  }
  const files = stripped(FILE_LINE, output).join('\n')
  return finding(Status.Ok, `Packed ${summary}`, textDetails('Files', files))
}

// "sqldoro-0.1.0.vsix (723.5kb, 17 files) · sha256 b6263872dbfe"
function describePackage([, name, size, count, hash]: RegExpExecArray): string {
  const files = plural(Number(count), 'file', 'files')
  return `${String(name)} (${String(size)}, ${files}) · sha256 ${String(hash).slice(0, SHORT_HASH)}`
}

function stripped(pattern: RegExp, output: string): string[] {
  return linesMatching(pattern, output).map((line) => line.replace(pattern, ''))
}
