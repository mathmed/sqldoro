import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runProcess = promisify(execFile)
// -z: one NUL after each path, which git then prints as is instead of quoting unusual names.
const PATH_SEPARATOR = '\0'

// Files added or modified between the merge base with `baseRef` and HEAD (deleted files cannot be
// mutated). The PR job checks out the full history so that the merge base exists.
export async function changedFiles(repository: string, baseRef: string): Promise<string[]> {
  return gitPaths(repository, 'diff', ['--name-only', '--diff-filter=d', `${baseRef}...HEAD`])
}

async function gitPaths(
  repository: string,
  command: string,
  args: readonly string[],
): Promise<string[]> {
  const { stdout } = await runProcess('git', [command, '-z', ...args], { cwd: repository })
  return stdout.split(PATH_SEPARATOR).filter((file) => file !== '')
}
