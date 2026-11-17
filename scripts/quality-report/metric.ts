import type { Metric } from './finding.ts'

const UNCHANGED = '='
const NO_BASE = 'n/a'

// "coverage 100.00% (=)", "score 91.2% (↓2.1)", "suppressions 9 (n/a)": the value and how it moved
// since the base branch, at the metric's own precision.
export function renderMetric(metric: Metric, base: Metric | undefined): string {
  return `${metric.label} ${formatValue(metric, metric.value)} (${delta(metric, base)})`
}

function delta(metric: Metric, base: Metric | undefined): string {
  if (base === undefined) {
    return NO_BASE
  }
  const difference = Number((metric.value - base.value).toFixed(metric.decimals))
  if (difference === 0) {
    return UNCHANGED
  }
  return `${difference > 0 ? '↑' : '↓'}${Math.abs(difference).toFixed(metric.decimals)}`
}

function formatValue(metric: Metric, value: number): string {
  return `${value.toFixed(metric.decimals)}${metric.unit}`
}
