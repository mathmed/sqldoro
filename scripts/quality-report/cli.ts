import { parseArgs } from 'node:util'

import { writeText } from '../shared/files.ts'
import { isAnalysis } from './analysis.ts'
import { evaluate } from './evaluate.ts'
import { footerFromEnvironment } from './footer.ts'
import { loadFragments } from './fragment.ts'
import { parseJobResults } from './job-results.ts'
import { renderReport } from './render.ts'
import { runCommand } from './run-command.ts'
import { SECTIONS } from './sections.ts'

const DEFAULT_DIRECTORY = 'quality-fragments'
const USAGE_ERROR = 2
const USAGE = `usage:
  quality-report run <analysis> [--dir <directory>] -- <command> [arguments...]
  quality-report render [--dir <directory>] [--needs-json <json>] [--output <file>]`

export async function main(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const separator = argv.indexOf('--')
  const options = separator === -1 ? argv : argv.slice(0, separator)
  const command = separator === -1 ? [] : argv.slice(separator + 1)
  const [subcommand, ...args] = options
  switch (subcommand) {
    case 'run':
      return run(args, command)
    case 'render':
      return render(args, environment)
    default:
      return usageError(`unknown command "${String(subcommand)}"`)
  }
}

async function run(args: readonly string[], command: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { dir: { type: 'string', default: DEFAULT_DIRECTORY } },
    allowPositionals: true,
  })
  const [analysis] = positionals
  const [program, ...programArgs] = command
  if (analysis === undefined || !isAnalysis(analysis)) {
    return usageError(`unknown analysis "${String(analysis)}"`)
  }
  if (program === undefined) {
    return usageError('missing the command to run after --')
  }
  return runCommand(analysis, [program, ...programArgs], values.dir)
}

async function render(args: readonly string[], environment: NodeJS.ProcessEnv): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      dir: { type: 'string', default: DEFAULT_DIRECTORY },
      'needs-json': { type: 'string', default: '' },
      output: { type: 'string' },
    },
  })
  const evidence = {
    fragments: await loadFragments(values.dir),
    jobResults: parseJobResults(values['needs-json']),
  }
  const results = SECTIONS.map((section) => evaluate(section, evidence))
  const report = renderReport(results, footerFromEnvironment(environment))
  if (values.output === undefined) {
    process.stdout.write(report)
  } else {
    await writeText(values.output, report)
  }
  return 0
}

function usageError(message: string): number {
  console.error(`${message}\n${USAGE}`)
  return USAGE_ERROR
}
