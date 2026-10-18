import { RiskFloorError } from './floors.ts'
import { LABEL_PREFIX, labelOf, rankOf, RISK_LEVELS, type RiskLevel } from './levels.ts'

const VALID_LABELS: readonly string[] = RISK_LEVELS.map(labelOf)

// The PR's labels as GitHub Actions gives them: toJSON(github.event.pull_request.labels.*.name).
export function parseLabels(labelsJson: string): string[] {
  const labels: unknown = JSON.parse(labelsJson === '' ? '[]' : labelsJson)
  if (!Array.isArray(labels) || !labels.every((label) => typeof label === 'string')) {
    throw new RiskFloorError(`--labels-json must be a JSON list of strings, got: ${labelsJson}`)
  }
  return labels
}

// Why the labels do not carry exactly one valid risk level at or above the floor, if they do not.
export function labelProblem(labels: readonly string[], floor: RiskLevel): string | undefined {
  const found = labels.filter((label) => label.startsWith(LABEL_PREFIX))
  const [label] = found
  if (label === undefined || found.length > 1) {
    const shown = found.length === 0 ? 'none' : found.join(', ')
    return `expected exactly one risk label (${VALID_LABELS.join(', ')}), found: ${shown}`
  }
  return levelProblem(label, floor)
}

function levelProblem(label: string, floor: RiskLevel): string | undefined {
  const level = RISK_LEVELS.find((candidate) => labelOf(candidate) === label)
  if (level === undefined) {
    return `unknown risk label ${label}: use one of ${VALID_LABELS.join(', ')}`
  }
  if (rankOf(level) < rankOf(floor)) {
    return `${label} is below the floor of this PR (${labelOf(floor)})`
  }
  return undefined
}
