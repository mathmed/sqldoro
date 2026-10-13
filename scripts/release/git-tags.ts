import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { TAG_REF_PREFIX } from './version-tag.ts'

const runProcess = promisify(execFile)
const REMOTE = 'origin'
const FIELD_SEPARATOR = '\t'
const PEELED_SUFFIX = '^{}'
// The tagger of the tags the release workflow creates with its GITHUB_TOKEN.
const TAGGER_NAME = 'github-actions[bot]'
const TAGGER_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'

export interface AnnotatedTag {
  readonly name: string
  readonly message: string
  readonly commit: string
}

export interface TagRepository {
  readonly tagCommits: () => Promise<ReadonlyMap<string, string>>
  readonly pushTag: (tag: AnnotatedTag) => Promise<void>
}

interface RemoteRef {
  readonly name: string
  readonly object: string
  readonly isPeeled: boolean
}

// The tags of origin (not of the shallow checkout, which has none) and the commit each one tags.
export function gitTags(repository: string): TagRepository {
  return {
    tagCommits: async () => parseRemoteTags(await git(repository, ['ls-remote', '--tags', REMOTE])),
    pushTag: async ({ name, message, commit }) => {
      await git(repository, [
        ...['-c', `user.name=${TAGGER_NAME}`, '-c', `user.email=${TAGGER_EMAIL}`],
        ...['tag', '--annotate', name, '--message', message, commit],
      ])
      await git(repository, ['push', REMOTE, `${TAG_REF_PREFIX}${name}`])
    },
  }
}

async function git(repository: string, args: readonly string[]): Promise<string> {
  const { stdout } = await runProcess('git', args, { cwd: repository })
  return stdout
}

// `git ls-remote --tags` lists every tag with the object it points to, and an annotated tag once
// more, peeled (`refs/tags/v1.2.3^{}`), with the commit it tags: that line wins.
function parseRemoteTags(output: string): ReadonlyMap<string, string> {
  const refs = output.split('\n').flatMap(parseRemoteRef)
  const ordered = [...refs.filter((ref) => !ref.isPeeled), ...refs.filter((ref) => ref.isPeeled)]
  return new Map(ordered.map((ref) => [ref.name, ref.object]))
}

function parseRemoteRef(line: string): RemoteRef[] {
  const [object = '', ref = ''] = line.split(FIELD_SEPARATOR)
  if (!ref.startsWith(TAG_REF_PREFIX)) {
    return []
  }
  const name = ref.slice(TAG_REF_PREFIX.length)
  const isPeeled = name.endsWith(PEELED_SUFFIX)
  return [{ name: isPeeled ? name.slice(0, -PEELED_SUFFIX.length) : name, object, isPeeled }]
}
