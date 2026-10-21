import { LABEL_PREFIX, labelOf, RISK_LEVELS } from './levels.ts'

const VALID_LABELS: readonly string[] = RISK_LEVELS.map(labelOf)

export class RiskLabelError extends Error {
  override readonly name = 'RiskLabelError'
}

// The PR's labels as a JSON list of names, as the workflow reads them from the GitHub API.
export function parseLabels(labelsJson: string): string[] {
  const labels: unknown = JSON.parse(labelsJson === '' ? '[]' : labelsJson)
  if (!Array.isArray(labels) || !labels.every((label) => typeof label === 'string')) {
    throw new RiskLabelError(`--labels-json must be a JSON list of strings, got: ${labelsJson}`)
  }
  return labels
}

// Why the labels do not carry exactly one known risk level, if they do not.
export function labelProblem(labels: readonly string[]): string | undefined {
  const found = labels.filter((label) => label.startsWith(LABEL_PREFIX))
  const [label] = found
  if (label === undefined || found.length > 1) {
    const shown = found.length === 0 ? 'none' : found.join(', ')
    return `expected exactly one risk label (${VALID_LABELS.join(', ')}), found: ${shown}`
  }
  if (!VALID_LABELS.includes(label)) {
    return `unknown risk label ${label}: use one of ${VALID_LABELS.join(', ')}`
  }
  return undefined
}
