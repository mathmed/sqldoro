// The two labels every pull request carries, each picked by judgment (.claude/agents/pr-writer.md).
const RiskLevel = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
} as const

// What shipping the change needs beyond the merge, from nothing to steps in a given order.
const DeployKind = {
  None: 'none',
  Simple: 'simple',
  Migration: 'migration',
  Coordinated: 'coordinated',
} as const

export interface LabelGroup {
  readonly name: string
  readonly values: readonly string[]
}

export const RISK_LABELS: LabelGroup = { name: 'risk', values: Object.values(RiskLevel) }
export const DEPLOY_LABELS: LabelGroup = { name: 'deploy', values: Object.values(DeployKind) }
export const LABEL_GROUPS: readonly LabelGroup[] = [RISK_LABELS, DEPLOY_LABELS]

export function labelsOf({ name, values }: LabelGroup): string[] {
  return values.map((value) => `${name}:${value}`)
}
