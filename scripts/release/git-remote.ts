import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { TAG_REF_PREFIX } from './version-tag.ts'

const runProcess = promisify(execFile)
const REMOTE = 'origin'
const BRANCH_REF_PREFIX = 'refs/heads/'
const FIELD_SEPARATOR = '\t'
const PEELED_SUFFIX = '^{}'
// The author of the commits and tags the release workflow pushes with its GITHUB_TOKEN.
const BOT_IDENTITY: readonly string[] = [
  ...['-c', 'user.name=github-actions[bot]'],
  ...['-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'],
]

interface AnnotatedTag {
  readonly name: string
  readonly message: string
  readonly commit: string
}

// What the release does to origin. The checkout is shallow: origin, not the clone, knows the
// branches and the tags.
export interface ReleaseRemote {
  readonly branchCommits: () => Promise<ReadonlyMap<string, string>>
  readonly tagCommits: () => Promise<ReadonlyMap<string, string>>
  readonly commitAll: (message: string) => Promise<string>
  readonly pushCommit: (commit: string, branch: string) => Promise<void>
  readonly pushTag: (tag: AnnotatedTag) => Promise<void>
  readonly deleteBranch: (branch: string) => Promise<void>
}

interface RemoteRef {
  readonly name: string
  readonly object: string
  readonly isPeeled: boolean
}

export function gitRemote(repository: string): ReleaseRemote {
  const run = async (args: readonly string[]): Promise<string> => git(repository, args)
  return {
    branchCommits: async () =>
      parseRemoteRefs(await run(['ls-remote', '--heads', REMOTE]), BRANCH_REF_PREFIX),
    tagCommits: async () =>
      parseRemoteRefs(await run(['ls-remote', '--tags', REMOTE]), TAG_REF_PREFIX),
    commitAll: async (message) => {
      await run([...BOT_IDENTITY, 'commit', '--all', '--message', message])
      return (await run(['rev-parse', 'HEAD'])).trim()
    },
    // Never forced: origin refuses anything but a fast-forward.
    pushCommit: async (commit, branch) => {
      await run(['push', REMOTE, `${commit}:${BRANCH_REF_PREFIX}${branch}`])
    },
    pushTag: async ({ name, message, commit }) => {
      await run([...BOT_IDENTITY, 'tag', '--annotate', name, '--message', message, commit])
      await run(['push', REMOTE, `${TAG_REF_PREFIX}${name}`])
    },
    deleteBranch: async (branch) => {
      await run(['push', REMOTE, '--delete', `${BRANCH_REF_PREFIX}${branch}`])
    },
  }
}

async function git(repository: string, args: readonly string[]): Promise<string> {
  const { stdout } = await runProcess('git', args, { cwd: repository })
  return stdout
}

// `git ls-remote` lists every ref with the object it points to, and an annotated tag once more,
// peeled (`refs/tags/v1.2.3^{}`), with the commit it tags: that line wins.
function parseRemoteRefs(output: string, prefix: string): ReadonlyMap<string, string> {
  const refs = output.split('\n').flatMap((line) => parseRemoteRef(line, prefix))
  const ordered = [...refs.filter((ref) => !ref.isPeeled), ...refs.filter((ref) => ref.isPeeled)]
  return new Map(ordered.map((ref) => [ref.name, ref.object]))
}

function parseRemoteRef(line: string, prefix: string): RemoteRef[] {
  const [object = '', ref = ''] = line.split(FIELD_SEPARATOR)
  if (!ref.startsWith(prefix)) {
    return []
  }
  const name = ref.slice(prefix.length)
  const isPeeled = name.endsWith(PEELED_SUFFIX)
  return [{ name: isPeeled ? name.slice(0, -PEELED_SUFFIX.length) : name, object, isPeeled }]
}
