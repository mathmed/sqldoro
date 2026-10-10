import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runProcess = promisify(execFile)

// Files added or modified between the merge base with `baseRef` and HEAD (deleted files cannot be
// mutated). The PR job checks out the full history so that the merge base exists.
export async function changedFiles(repository: string, baseRef: string): Promise<string[]> {
  const { stdout } = await runProcess(
    'git',
    ['diff', '--name-only', '--diff-filter=d', `${baseRef}...HEAD`],
    { cwd: repository },
  )
  return stdout.split('\n').filter((file) => file !== '')
}
