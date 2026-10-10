import { cleanOutput, linesMatching, plural } from '../../shared/text.ts'
import { finding, type Finding, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

// esbuild prints one "  <file>  <size>" line per output file, then "⚡ Done in <time>".
const BUNDLE_LINE = /^\s+(\S+\.c?js)\s+(\d[\d.]*[a-z]*b)$/i
const DONE_LINE = /Done in (\S+)$/m
const ERROR_LINE = /^✘ \[ERROR\] /

export function analyzeBuild(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  return hasPassed(fragment) ? passedBuild(output) : failedBuild(output)
}

function passedBuild(output: string): Finding {
  const bundles = output
    .split('\n')
    .map(parseBundle)
    .filter((bundle) => bundle !== undefined)
  const built = bundles.length === 0 ? 'Built' : `Bundled ${bundles.join(', ')}`
  const time = DONE_LINE.exec(output)?.[1]
  return finding(Status.Ok, time === undefined ? built : `${built} in ${time}`)
}

function parseBundle(line: string): string | undefined {
  const match = BUNDLE_LINE.exec(line)
  if (match === null) {
    return undefined
  }
  const [, file = '', size = ''] = match
  return `${file} ${size}`
}

function failedBuild(output: string): Finding {
  const errors = linesMatching(ERROR_LINE, output).length
  const summary = errors === 0 ? 'Build failed' : plural(errors, 'build error', 'build errors')
  return finding(Status.Failed, summary, textDetails('Output', output))
}
