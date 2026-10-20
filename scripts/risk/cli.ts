import { parseArgs } from 'node:util'

import { labelProblem, parseLabels, RiskLabelError } from './label-check.ts'

const USAGE_ERROR = 2
const USAGE = `usage:
  risk check --labels-json <json>
      fail unless the labels hold exactly one known risk:<level> label`

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
    if (!(error instanceof RiskLabelError)) {
      throw error
    }
    console.error(`Risk label check failed: ${error.message}`)
    return 1
  }
}

function checkLabels(labelsJson: string): number {
  const problem = labelProblem(parseLabels(labelsJson))
  if (problem !== undefined) {
    console.error(`Risk label check failed: ${problem}.`)
    return 1
  }
  console.log('Risk label check passed.')
  return 0
}
