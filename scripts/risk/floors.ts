import { matchesGlob } from 'node:path'

import { parse } from 'yaml'

import { highestOf, isRiskLevel, type RiskLevel } from './levels.ts'

export class RiskFloorError extends Error {
  override readonly name = 'RiskFloorError'
}

export interface Floor {
  readonly category: string
  readonly level: RiskLevel
  readonly patterns: readonly string[]
}

interface FloorHit {
  readonly category: string
  readonly level: RiskLevel
  readonly files: readonly string[]
}

export interface Assessment {
  readonly floor: RiskLevel
  readonly hits: readonly FloorHit[]
}

// .github/risk-floors.yaml: a `floors` list of { category, level, paths }.
export function parseFloors(text: string): Floor[] {
  const document: unknown = parse(text)
  const floors = isRecord(document) ? document['floors'] : undefined
  if (!Array.isArray(floors)) {
    throw new RiskFloorError('the risk floors need a top-level `floors` list')
  }
  return floors.map(parseFloor)
}

function parseFloor(entry: unknown): Floor {
  if (!isRecord(entry)) {
    throw new RiskFloorError(`each floor must be a mapping, got: ${JSON.stringify(entry)}`)
  }
  const { category, level, paths } = entry
  if (typeof category !== 'string' || !isPatternList(paths)) {
    const shown = JSON.stringify(entry)
    throw new RiskFloorError(`each floor needs a category and a non-empty list of paths: ${shown}`)
  }
  if (!isRiskLevel(level)) {
    throw new RiskFloorError(`unknown level ${JSON.stringify(level)} in the floor "${category}"`)
  }
  return { category, level, patterns: paths }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPatternList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
}

// `*` matches inside one path segment and `**` any number of segments; neither matches a name that
// starts with a dot, so dotfiles and dot folders are named explicitly.
export function assess(files: readonly string[], floors: readonly Floor[]): Assessment {
  const hits = floors
    .map(({ category, level, patterns }) => ({
      category,
      level,
      files: files.filter((file) => patterns.some((pattern) => matchesGlob(file, pattern))),
    }))
    .filter((hit) => hit.files.length > 0)
  return { floor: highestOf(hits.map((hit) => hit.level)), hits }
}

export function describeAssessment({ floor, hits }: Assessment): string {
  const lines = hits.map(
    ({ category, level, files }) => `- ${category} (${level}): ${files.join(', ')}`,
  )
  return [
    `Risk floor: ${floor}`,
    ...(lines.length === 0 ? ['- no file matches a floor category'] : lines),
  ].join('\n')
}
