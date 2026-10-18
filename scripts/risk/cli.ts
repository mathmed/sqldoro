import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { readText } from '../shared/files.ts'
import {
  assess,
  type Assessment,
  describeAssessment,
  parseFloors,
  RiskFloorError,
} from './floors.ts'
import { labelProblem, parseLabels } from './label-check.ts'

const DEFAULT_FLOORS = '.github/risk-floors.yaml'
const DEFAULT_BASE = 'origin/main'
const USAGE_ERROR = 2
const USAGE = `usage:
  risk floor [--base <ref>] [--floors <file>]
      print the risk floor of the changes since <ref> (default ${DEFAULT_BASE})
  risk check --labels-json <json> [--base <ref>] [--floors <file>]
      fail unless the PR has exactly one risk:<level> label at or above the floor`

export interface RiskContext {
  readonly root: string
  readonly touchedFiles: (baseRef: string) => Promise<readonly string[]>
}

export async function main(argv: readonly string[], context: RiskContext): Promise<number> {
  const [command = '', ...args] = argv
  const { values } = parseArgs({
    args: [...args],
    options: {
      base: { type: 'string', default: DEFAULT_BASE },
      floors: { type: 'string', default: DEFAULT_FLOORS },
      'labels-json': { type: 'string' },
    },
  })
  const request = requestOf(command, values['labels-json'])
  if (request === undefined) {
    console.error(`unknown command "${command}", or check without --labels-json\n${USAGE}`)
    return USAGE_ERROR
  }
  try {
    return await run(request, values, context)
  } catch (error) {
    if (!(error instanceof RiskFloorError)) {
      throw error
    }
    console.error(`Risk label check failed: ${error.message}`)
    return 1
  }
}

// What to do: print the floor, or also check the labels (check).
interface Request {
  readonly labelsJson: string | undefined
}

function requestOf(command: string, labelsJson: string | undefined): Request | undefined {
  if (command === 'floor') {
    return { labelsJson: undefined }
  }
  return command === 'check' && labelsJson !== undefined ? { labelsJson } : undefined
}

async function run(request: Request, sources: Sources, context: RiskContext): Promise<number> {
  const assessment = await assessChanges(context, sources)
  console.log(describeAssessment(assessment))
  return request.labelsJson === undefined ? 0 : checkLabels(request.labelsJson, assessment)
}

interface Sources {
  readonly base: string
  readonly floors: string
}

async function assessChanges(context: RiskContext, sources: Sources): Promise<Assessment> {
  const floors = parseFloors(await readText(join(context.root, sources.floors)))
  return assess(await context.touchedFiles(sources.base), floors)
}

function checkLabels(labelsJson: string, assessment: Assessment): number {
  const problem = labelProblem(parseLabels(labelsJson), assessment.floor)
  if (problem !== undefined) {
    console.error(`Risk label check failed: ${problem}.`)
    return 1
  }
  console.log('Risk label is at or above the floor.')
  return 0
}
