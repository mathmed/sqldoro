import {
  hasReachedMinScore,
  type MutationResult,
  type Survivor,
} from '../shared/mutation-result.ts'

const TITLE = '## Mutation testing'

export function renderSummary(result: MutationResult): string {
  if (result.isSkipped) {
    return `${TITLE}\n\n${result.reason}\n`
  }
  const verdict = hasReachedMinScore(result) ? '✅ passed' : '❌ failed'
  const lines = [
    TITLE,
    '',
    `**Score: ${result.score.toFixed(1)}%** (minimum ${String(result.minScore)}%, ${verdict})`,
    '',
    '| Killed 🎉 | Survived 🙁 | Ignored | Total |',
    '| ---: | ---: | ---: | ---: |',
    `| ${String(result.killed)} | ${String(result.survivors.length)} | ${String(result.ignored)} | ${String(result.total)} |`,
    ...survivorLines(result.survivors),
  ]
  return `${lines.join('\n')}\n`
}

function survivorLines(survivors: readonly Survivor[]): string[] {
  if (survivors.length === 0) {
    return []
  }
  return [
    '',
    '### Survivors',
    '',
    '| Location | Mutator | Replacement | Status |',
    '| --- | --- | --- | --- |',
    ...survivors.map(
      ({ file, line, mutator, replacement, status }) =>
        `| \`${file}:${String(line)}\` | ${mutator} | \`${replacement.replaceAll('|', '\\|')}\` | ${status} |`,
    ),
    '',
    'Each survivor is a change no test noticed: add the missing assertion (`reports/mutation/mutation.html` shows the diff).',
  ]
}
