import { parseArgs } from 'node:util'

import { writeText } from '../shared/files.ts'
import { isAnalysis } from './analysis.ts'
import { type Baseline, baselineNote, loadBaseline } from './baseline.ts'
import { evaluate } from './evaluate.ts'
import { footerFromEnvironment, runUrl } from './footer.ts'
import { loadFragments } from './fragment.ts'
import { parseJobResults } from './job-results.ts'
import { renderReport, type ReportContext } from './render.ts'
import { runCommand } from './run-command.ts'
import { SECTIONS } from './sections.ts'

const DEFAULT_DIRECTORY = 'quality-fragments'
const DEFAULT_BASE_NAME = 'main'
const USAGE_ERROR = 2
const USAGE = `usage:
  quality-report run <analysis> [--dir <directory>] -- <command> [arguments...]
  quality-report render [--dir <directory>] [--needs-json <json>] [--output <file>]
                        [--base-dir <directory>] [--base-name <branch>]`

// The CI environment (repository, run, commit, base run) and the time of the report.
export interface QualityReportContext {
  readonly environment: NodeJS.ProcessEnv
  readonly now: Date
}

export async function main(
  argv: readonly string[],
  context: QualityReportContext,
): Promise<number> {
  const separator = argv.indexOf('--')
  const options = separator === -1 ? argv : argv.slice(0, separator)
  const command = separator === -1 ? [] : argv.slice(separator + 1)
  const [subcommand, ...args] = options
  switch (subcommand) {
    case 'run':
      return run(args, command)
    case 'render':
      return render(args, context)
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

async function render(args: readonly string[], context: QualityReportContext): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      dir: { type: 'string', default: DEFAULT_DIRECTORY },
      'needs-json': { type: 'string', default: '' },
      output: { type: 'string' },
      'base-dir': { type: 'string' },
      'base-name': { type: 'string', default: DEFAULT_BASE_NAME },
    },
  })
  const baseline = await loadBaseline({
    directory: values['base-dir'],
    name: values['base-name'],
    runUrl: runUrl(context.environment, context.environment['QUALITY_REPORT_BASE_RUN_ID']),
  })
  const evidence = {
    fragments: await loadFragments(values.dir),
    jobResults: parseJobResults(values['needs-json']),
    baseFragments: baseline.fragments,
  }
  const results = SECTIONS.map((section) => evaluate(section, evidence))
  await publish(renderReport(results, reportContext(baseline, context)), values.output)
  return 0
}

function reportContext(baseline: Baseline, context: QualityReportContext): ReportContext {
  const footer = [footerFromEnvironment(context.environment, context.now), baselineNote(baseline)]
  return { baseName: baseline.name, footer: footer.join(' · ') }
}

async function publish(report: string, output: string | undefined): Promise<void> {
  if (output === undefined) {
    process.stdout.write(report)
    return
  }
  await writeText(output, report)
}

function usageError(message: string): number {
  console.error(`${message}\n${USAGE}`)
  return USAGE_ERROR
}
