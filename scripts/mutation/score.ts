import { relative, resolve } from 'node:path'

import type { MutantResult } from '@stryker-mutator/api/core'

import type { FileScore, MutationResult, Survivor } from '../shared/mutation-result.ts'

const PERCENT = 100
// Same definition as Stryker's mutation score: compile and runtime errors are not valid mutants,
// and a mutant no test covers counts as a survivor.
const DETECTED: ReadonlySet<string> = new Set(['Killed', 'Timeout'])
const UNDETECTED: ReadonlySet<string> = new Set(['Survived', 'NoCoverage'])
const IGNORED = 'Ignored'

export interface ScoreOptions {
  readonly minScore: number
  readonly root: string
}

export function scoreMutants(
  mutants: readonly MutantResult[],
  { minScore, root }: ScoreOptions,
): MutationResult {
  const tested = mutants.filter(({ status }) => DETECTED.has(status) || UNDETECTED.has(status))
  const killed = tested.filter(isDetected).length
  return {
    isSkipped: false,
    reason: '',
    score: percentage(killed, tested.length),
    minScore,
    killed,
    total: tested.length,
    ignored: mutants.filter(({ status }) => status === IGNORED).length,
    files: fileScores(tested, root),
    survivors: tested
      .filter((mutant) => !isDetected(mutant))
      .map((mutant) => toSurvivor(mutant, root)),
  }
}

export function skippedResult(reason: string, minScore: number): MutationResult {
  return {
    isSkipped: true,
    reason,
    score: PERCENT,
    minScore,
    killed: 0,
    total: 0,
    ignored: 0,
    files: [],
    survivors: [],
  }
}

function isDetected({ status }: MutantResult): boolean {
  return DETECTED.has(status)
}

function percentage(part: number, whole: number): number {
  return whole === 0 ? PERCENT : (part / whole) * PERCENT
}

function fileScores(mutants: readonly MutantResult[], root: string): FileScore[] {
  const byFile = Map.groupBy(mutants, ({ fileName }) => relativePath(fileName, root))
  return [...byFile]
    .map(([file, fileMutants]): FileScore => {
      const killed = fileMutants.filter(isDetected).length
      return {
        file,
        total: fileMutants.length,
        killed,
        score: percentage(killed, fileMutants.length),
      }
    })
    .toSorted((left, right) => left.file.localeCompare(right.file))
}

function toSurvivor(mutant: MutantResult, root: string): Survivor {
  return {
    file: relativePath(mutant.fileName, root),
    line: mutant.location.start.line,
    mutator: mutant.mutatorName,
    replacement: mutant.replacement,
    status: mutant.status,
  }
}

function relativePath(fileName: string, root: string): string {
  return relative(root, resolve(root, fileName))
}
