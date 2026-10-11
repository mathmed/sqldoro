// Throwaway git repositories for the tests of the scripts that read the history. A git hook exports
// GIT_DIR, GIT_INDEX_FILE and more to the commands it runs, and the pre-commit hook runs the tests:
// inherited, those variables point every git process at the repository being committed, whatever
// its working directory. createRepository removes them (and the user's own git configuration) from
// the environment for the rest of the test, so the code under test runs isolated too; Vitest
// restores the environment before the next test (`unstubEnvs`).
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { vi } from 'vitest'

const runProcess = promisify(execFile)
const GIT_VARIABLE_PREFIX = 'GIT_'
const TEST_NAME = 'Test'
const TEST_EMAIL = 'test@example.com'
const ISOLATED_ENVIRONMENT: ReadonlyMap<string, string> = new Map([
  ['GIT_CONFIG_GLOBAL', devNull],
  ['GIT_CONFIG_NOSYSTEM', '1'],
  ['GIT_AUTHOR_NAME', TEST_NAME],
  ['GIT_AUTHOR_EMAIL', TEST_EMAIL],
  ['GIT_COMMITTER_NAME', TEST_NAME],
  ['GIT_COMMITTER_EMAIL', TEST_EMAIL],
])

function isolateGit(): void {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith(GIT_VARIABLE_PREFIX)) {
      vi.stubEnv(name, undefined)
    }
  }
  for (const [name, value] of ISOLATED_ENVIRONMENT) {
    vi.stubEnv(name, value)
  }
}

export async function git(repository: string, ...args: readonly string[]): Promise<string> {
  const { stdout } = await runProcess('git', args, { cwd: repository })
  return stdout
}

export async function createRepository(): Promise<string> {
  isolateGit()
  const repository = await mkdtemp(join(tmpdir(), 'sqldoro-git-'))
  await git(repository, 'init', '--quiet', '--initial-branch=main')
  return repository
}

export async function commitFiles(
  repository: string,
  files: ReadonlyMap<string, string>,
  message: string,
): Promise<void> {
  for (const [name, content] of files) {
    await writeFile(join(repository, name), content)
  }
  await git(repository, 'add', '--all')
  await git(repository, 'commit', '--quiet', '--message', message)
}
