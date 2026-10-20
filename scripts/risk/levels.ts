export const RiskLevel = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
} as const

export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel]

// From the least to the most risky.
export const RISK_LEVELS: readonly RiskLevel[] = Object.values(RiskLevel)

export const LABEL_PREFIX = 'risk:'

export function labelOf(level: RiskLevel): string {
  return `${LABEL_PREFIX}${level}`
}
