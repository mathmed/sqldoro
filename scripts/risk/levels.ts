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

export function isRiskLevel(value: unknown): value is RiskLevel {
  return RISK_LEVELS.some((level) => level === value)
}

export function rankOf(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level)
}

export function labelOf(level: RiskLevel): string {
  return `${LABEL_PREFIX}${level}`
}

export function highestOf(levels: readonly RiskLevel[]): RiskLevel {
  return levels.reduce(
    (highest, level) => (rankOf(level) > rankOf(highest) ? level : highest),
    RiskLevel.Low,
  )
}
