import { cleanOutput, plural } from '../../shared/text.ts'
import { finding, type Finding, markdownDetails, textDetails } from '../finding.ts'
import { type Fragment, hasPassed } from '../fragment.ts'
import { Status } from '../status.ts'

const MAX_CLONES_LISTED = 50

// " - src/a.ts [172:42 - 186:38] (15 lines, 100 tokens)" then "   src/b.ts [199:38 - 213:38]"
const CLONE =
  /^ - (\S+) \[(\d+):\d+ - (\d+):\d+\] \((\d+) lines, (\d+) tokens\)\n {3}(\S+) \[(\d+):\d+ - (\d+):\d+\]$/gm
// "│ Total:     │ 451            │ 44039 ..."
const FILES_ANALYZED = /^│ Total:\s*│\s*(\d+)\s*│/m

interface Clone {
  readonly first: string
  readonly second: string
  readonly lines: number
  readonly tokens: number
}

export function analyzeJscpd(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const clones = [...output.matchAll(CLONE)].map(cloneOf)
  if (hasPassed(fragment) && clones.length === 0) {
    return finding(Status.Ok, `No duplicated code in ${filesAnalyzed(output)}`)
  }
  if (clones.length === 0) {
    return finding(Status.Failed, 'jscpd failed', textDetails('Output', output))
  }
  const lines = clones.reduce((sum, clone) => sum + clone.lines, 0)
  const summary = `${plural(clones.length, 'clone', 'clones')} (${plural(lines, 'duplicated line', 'duplicated lines')})`
  return finding(Status.Failed, summary, markdownDetails('Clones', listing(clones)))
}

// The groups of CLONE: the first place, its lines and size, then the second place.
function cloneOf(match: RegExpExecArray): Clone {
  const [, first, from, to, lines, tokens, second, secondFrom, secondTo] = match.map(String)
  return {
    first: `${String(first)}:${String(from)}-${String(to)}`,
    second: `${String(second)}:${String(secondFrom)}-${String(secondTo)}`,
    lines: Number(lines),
    tokens: Number(tokens),
  }
}

function filesAnalyzed(output: string): string {
  const count = FILES_ANALYZED.exec(output)?.[1]
  return count === undefined ? 'the analyzed files' : plural(Number(count), 'file', 'files')
}

function listing(clones: readonly Clone[]): string {
  const listed = clones.slice(0, MAX_CLONES_LISTED)
  const hidden = clones.length - listed.length
  return [
    ...listed.map(
      ({ first, second, lines, tokens }) =>
        `- \`${first}\` ↔ \`${second}\` (${String(lines)} lines, ${String(tokens)} tokens)`,
    ),
    ...(hidden > 0 ? ['', `... and ${String(hidden)} more: run \`make duplication\`.`] : []),
  ].join('\n')
}
