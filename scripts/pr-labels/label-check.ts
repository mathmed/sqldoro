import { LABEL_GROUPS, type LabelGroup, labelsOf } from './groups.ts'

export class PrLabelError extends Error {
  override readonly name = 'PrLabelError'
}

// The PR's labels as a JSON list of names, as the workflow reads them from the GitHub API.
export function parseLabels(labelsJson: string): string[] {
  const labels: unknown = JSON.parse(labelsJson === '' ? '[]' : labelsJson)
  if (!Array.isArray(labels) || !labels.every((label) => typeof label === 'string')) {
    throw new PrLabelError(`--labels-json must be a JSON list of strings, got: ${labelsJson}`)
  }
  return labels
}

// Why the labels do not carry exactly one known label of each group, group by group.
export function labelProblems(labels: readonly string[]): string[] {
  return LABEL_GROUPS.map((group) => groupProblem(group, labels)).filter(
    (problem) => problem !== undefined,
  )
}

function groupProblem(group: LabelGroup, labels: readonly string[]): string | undefined {
  const valid = labelsOf(group)
  const found = labels.filter((label) => label.startsWith(`${group.name}:`))
  const [label] = found
  if (label === undefined || found.length > 1) {
    const shown = found.length === 0 ? 'none' : found.join(', ')
    return `expected exactly one ${group.name} label (${valid.join(', ')}), found: ${shown}`
  }
  if (!valid.includes(label)) {
    return `unknown ${group.name} label ${label}: use one of ${valid.join(', ')}`
  }
  return undefined
}
