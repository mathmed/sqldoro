import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runProcess = promisify(execFile)

// When the last commit was made, in seconds since the epoch: the date of every file of the .vsix, so
// that the same commit always packs the same bytes.
export async function lastCommitTime(repository: string): Promise<number> {
  const { stdout } = await runProcess('git', ['log', '-1', '--format=%ct'], { cwd: repository })
  return Number(stdout.trim())
}
