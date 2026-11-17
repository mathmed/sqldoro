import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runProcess = promisify(execFile)
// -z: one NUL after each path, which git then prints as is instead of quoting unusual names.
const PATH_SEPARATOR = '\0'
// 16 MiB, room for a large manifest: execFile stops at 1 MiB by default.
const MAX_SHOWN_BYTES = 16_777_216

// Files added or modified between the merge base with `baseRef` and HEAD (deleted files cannot be
// mutated). The PR job checks out the full history so that the merge base exists.
export async function changedFiles(repository: string, baseRef: string): Promise<string[]> {
  return gitPaths(repository, 'diff', ['--name-only', '--diff-filter=d', `${baseRef}...HEAD`])
}

// The changes of the files between the merge base with `baseRef` and HEAD, without context lines.
export async function unifiedDiff(
  repository: string,
  baseRef: string,
  files: readonly string[],
): Promise<string> {
  const args = ['diff', '--unified=0', '--no-color', '--no-ext-diff', `${baseRef}...HEAD`, '--']
  const { stdout } = await runProcess('git', [...args, ...files], { cwd: repository })
  return stdout
}

// The text of a file as it was at the merge base with `baseRef`.
export async function fileAtMergeBase(
  repository: string,
  baseRef: string,
  path: string,
): Promise<string> {
  const { stdout: mergeBase } = await runProcess('git', ['merge-base', 'HEAD', baseRef], {
    cwd: repository,
  })
  const { stdout } = await runProcess('git', ['show', `${mergeBase.trim()}:${path}`], {
    cwd: repository,
    maxBuffer: MAX_SHOWN_BYTES,
  })
  return stdout
}

// Files added between the merge base with `baseRef` and HEAD.
export async function addedFiles(repository: string, baseRef: string): Promise<string[]> {
  return gitPaths(repository, 'diff', ['--name-only', '--diff-filter=A', `${baseRef}...HEAD`])
}

// Files the index adds to the next commit.
export async function stagedAddedFiles(repository: string): Promise<string[]> {
  return gitPaths(repository, 'diff', ['--cached', '--name-only', '--diff-filter=A'])
}

// The files of the working tree git knows or would add: tracked or untracked, never ignored, and
// still on disk.
export async function workingTreeFiles(repository: string): Promise<string[]> {
  const listed = await gitPaths(repository, 'ls-files', [
    '--cached',
    '--others',
    '--exclude-standard',
  ])
  const deleted = new Set(await gitPaths(repository, 'ls-files', ['--deleted']))
  return [...new Set(listed)].filter((file) => !deleted.has(file))
}

async function gitPaths(
  repository: string,
  command: string,
  args: readonly string[],
): Promise<string[]> {
  const { stdout } = await runProcess('git', [command, '-z', ...args], { cwd: repository })
  return stdout.split(PATH_SEPARATOR).filter((file) => file !== '')
}
