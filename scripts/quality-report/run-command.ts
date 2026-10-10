import { spawn } from 'node:child_process'

import type { Analysis } from './analysis.ts'
import { writeFragment } from './fragment.ts'

const COMMAND_NOT_FOUND = 127
const MILLISECONDS_PER_SECOND = 1000

interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

export async function runCommand(
  analysis: Analysis,
  command: readonly [string, ...string[]],
  directory: string,
): Promise<number> {
  const started = performance.now()
  const result = await execute(command)
  const seconds = (performance.now() - started) / MILLISECONDS_PER_SECOND
  // Absolute checkout paths only add noise (and differ between machines).
  const output = result.output.replaceAll(`${process.cwd()}/`, '')
  await writeFragment(directory, { analysis, exitCode: result.exitCode, output, seconds })
  return result.exitCode
}

// Running the command given after `--` is what `run` is for: CI passes its own analysis commands,
// never untrusted input, and no shell is involved.
async function execute([program, ...args]: readonly [string, ...string[]]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const chunks: string[] = []
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const collect = (chunk: string): void => {
      process.stdout.write(chunk)
      chunks.push(chunk)
    }
    child.stdout.setEncoding('utf8').on('data', collect)
    child.stderr.setEncoding('utf8').on('data', collect)
    child.on('error', (error) => {
      resolve({ exitCode: COMMAND_NOT_FOUND, output: `could not run ${program}: ${error.message}` })
    })
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, output: chunks.join('') })
    })
  })
}
