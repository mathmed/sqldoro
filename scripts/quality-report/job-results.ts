import { parseObject } from '../shared/json.ts'

export const JobResult = {
  Success: 'success',
  Cancelled: 'cancelled',
  Skipped: 'skipped',
  Unknown: 'unknown',
} as const

export type JobResults = ReadonlyMap<string, string>

// `needs-json` is `${{ toJSON(needs) }}` in the quality-report job: { "<job>": { "result": "..." } }.
export function parseJobResults(needsJson: string): JobResults {
  if (needsJson === '') {
    return new Map()
  }
  const needs = parseObject(JSON.parse(needsJson))
  return new Map([...needs].map(([job, need]) => [job, resultOf(need)]))
}

function resultOf(need: unknown): string {
  const result = parseObject(need).get('result')
  return typeof result === 'string' ? result : JobResult.Unknown
}
