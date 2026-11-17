import { execFile, type ExecFileException } from 'node:child_process'

// 64 MiB: the JSON report of a large dependency tree outgrows execFile's 1 MiB default.
const MAX_OUTPUT_BYTES = 67_108_864

interface Finished {
  readonly stdout: string
  readonly error: ExecFileException | null
}

// The JSON report the audit command prints. It exits with 1 when it finds a vulnerability, which is
// not a failure to run it: only a command that could not start, or was stopped, is.
export async function auditReport([program, ...args]: readonly [
  string,
  ...string[],
]): Promise<string> {
  const { stdout, error } = await new Promise<Finished>((resolve) => {
    execFile(program, args, { maxBuffer: MAX_OUTPUT_BYTES }, (failure, output) => {
      resolve({ stdout: output, error: failure })
    })
  })
  if (error !== null && typeof error.code !== 'number') {
    throw new Error(`could not run ${program}: ${error.message}`)
  }
  return stdout
}
