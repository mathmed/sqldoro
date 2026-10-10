import {
  type FileScore,
  hasReachedMinScore,
  type MutationResult,
  parseResultLine,
  type Survivor,
} from '../../shared/mutation-result.ts'
import { cleanOutput, plural } from '../../shared/text.ts'
import { finding, type Finding, markdownDetails, textDetails } from '../finding.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'

const MAX_SURVIVORS_LISTED = 30
const MAX_CELL_LENGTH = 80

export function analyzeMutation(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const result = parseResultLine(output)
  if (result === undefined) {
    const summary = 'Stryker failed before producing a score'
    return finding(Status.Failed, summary, textDetails('Output', output))
  }
  if (result.isSkipped) {
    return finding(Status.Skipped, result.reason)
  }
  const status = hasReachedMinScore(result) ? Status.Ok : Status.Failed
  return finding(status, summarize(result), markdownDetails('Mutated files', details(result)))
}

function summarize(result: MutationResult): string {
  const survivors = plural(result.survivors.length, 'survivor', 'survivors')
  const files = plural(result.files.length, 'mutated file', 'mutated files')
  const parts = [
    `score ${result.score.toFixed(1)}% (ratchet ${String(result.minScore)}%)`,
    `${String(result.killed)} of ${String(result.total)} mutants killed`,
    `${survivors} in ${files}`,
  ]
  if (result.ignored > 0) {
    parts.push(`${plural(result.ignored, 'mutant', 'mutants')} ignored by \`Stryker disable\``)
  }
  return parts.join(' · ')
}

function details(result: MutationResult): string {
  const table = ['| File | Mutants | Killed | Score |', '| --- | ---: | ---: | ---: |']
  return [...table, ...result.files.map(fileRow), ...survivorsListing(result.survivors)].join('\n')
}

function fileRow({ file, total, killed, score }: FileScore): string {
  return `| \`${file}\` | ${String(total)} | ${String(killed)} | ${score.toFixed(1)}% |`
}

function survivorsListing(survivors: readonly Survivor[]): string[] {
  if (survivors.length === 0) {
    return []
  }
  const listed = survivors.slice(0, MAX_SURVIVORS_LISTED)
  const hidden = survivors.length - listed.length
  return [
    '',
    '**Survivors**',
    '',
    '| Location | Mutator | Replacement | Status |',
    '| --- | --- | --- | --- |',
    ...listed.map(survivorRow),
    ...(hidden > 0 ? ['', `... and ${String(hidden)} more in the \`mutation\` job summary.`] : []),
    '',
    'Reproduce with `make mutation-changed` and open `reports/mutation/mutation.html`.',
  ]
}

function survivorRow({ file, line, mutator, replacement, status }: Survivor): string {
  return `| \`${file}:${String(line)}\` | ${mutator} | ${inlineCode(replacement)} | ${status} |`
}

function inlineCode(text: string): string {
  const flat = text.replaceAll(/\s+/g, ' ').replaceAll('`', "'").replaceAll('|', '\\|')
  const shown = flat.length > MAX_CELL_LENGTH ? `${flat.slice(0, MAX_CELL_LENGTH)}…` : flat
  return `\`${shown}\``
}
