import { ARRAY, BOOLEAN, field, NUMBER, parseObject, STRING } from './json.ts'

// scripts/mutation.ts prints this line; the mutation analyzer of the Quality Report reads it.
export const MUTATION_RESULT_PREFIX = 'MUTATION_RESULT: '

export interface FileScore {
  readonly file: string
  readonly total: number
  readonly killed: number
  readonly score: number
}

export interface Survivor {
  readonly file: string
  readonly line: number
  readonly mutator: string
  readonly replacement: string
  readonly status: string
}

export interface MutationResult {
  readonly isSkipped: boolean
  readonly reason: string
  readonly score: number
  readonly minScore: number
  readonly killed: number
  readonly total: number
  readonly ignored: number
  readonly files: readonly FileScore[]
  readonly survivors: readonly Survivor[]
}

export function hasReachedMinScore(result: MutationResult): boolean {
  return result.score >= result.minScore
}

export function formatResultLine(result: MutationResult): string {
  return `${MUTATION_RESULT_PREFIX}${JSON.stringify(result)}`
}

export function parseResultLine(output: string): MutationResult | undefined {
  const line = output.split('\n').find((candidate) => candidate.startsWith(MUTATION_RESULT_PREFIX))
  if (line === undefined) {
    return undefined
  }
  return parseResult(JSON.parse(line.slice(MUTATION_RESULT_PREFIX.length)))
}

function parseResult(value: unknown): MutationResult {
  const result = parseObject(value)
  return {
    isSkipped: field(result, 'isSkipped', BOOLEAN),
    reason: field(result, 'reason', STRING),
    score: field(result, 'score', NUMBER),
    minScore: field(result, 'minScore', NUMBER),
    killed: field(result, 'killed', NUMBER),
    total: field(result, 'total', NUMBER),
    ignored: field(result, 'ignored', NUMBER),
    files: field(result, 'files', ARRAY).map(parseFileScore),
    survivors: field(result, 'survivors', ARRAY).map(parseSurvivor),
  }
}

function parseFileScore(value: unknown): FileScore {
  const score = parseObject(value)
  return {
    file: field(score, 'file', STRING),
    total: field(score, 'total', NUMBER),
    killed: field(score, 'killed', NUMBER),
    score: field(score, 'score', NUMBER),
  }
}

function parseSurvivor(value: unknown): Survivor {
  const survivor = parseObject(value)
  return {
    file: field(survivor, 'file', STRING),
    line: field(survivor, 'line', NUMBER),
    mutator: field(survivor, 'mutator', STRING),
    replacement: field(survivor, 'replacement', STRING),
    status: field(survivor, 'status', STRING),
  }
}
