import { parseArgs } from 'node:util'

import { labelProblems, parseLabels, PrLabelError } from './label-check.ts'

const USAGE_ERROR = 2
const USAGE = `usage:
  pr-labels check --labels-json <json>
      fail unless the labels hold exactly one known risk:<level> and one known deploy:<kind> label`

export function main(argv: readonly string[]): number {
  const [command = '', ...args] = argv
  const { values } = parseArgs({ args: [...args], options: { 'labels-json': { type: 'string' } } })
  const labelsJson = values['labels-json']
  if (command !== 'check' || labelsJson === undefined) {
    console.error(`unknown command "${command}", or check without --labels-json\n${USAGE}`)
    return USAGE_ERROR
  }
  return checkReadableLabels(labelsJson)
}

function checkReadableLabels(labelsJson: string): number {
  try {
    return checkLabels(labelsJson)
  } catch (error) {
    if (!(error instanceof PrLabelError)) {
      throw error
    }
    console.error(`PR label check failed: ${error.message}`)
    return 1
  }
}

function checkLabels(labelsJson: string): number {
  const problems = labelProblems(parseLabels(labelsJson))
  for (const problem of problems) {
    console.error(`PR label check failed: ${problem}.`)
  }
  if (problems.length > 0) {
    return 1
  }
  console.log('PR labels are set: one risk label and one deploy label.')
  return 0
}
