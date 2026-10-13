import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { appendText, readText, writeText } from '../shared/files.ts'
import { field, parseObject, STRING } from '../shared/json.ts'
import type { AnnotatedTag, TagRepository } from './git-tags.ts'
import { planRelease, type ReleasePlan, TagAction, tagAction } from './plan.ts'
import { checkRelease } from './release-check.ts'
import { versionOf } from './version-tag.ts'

const USAGE_ERROR = 2
const FULL_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u
const LINE_BREAK = /[\r\n]/u
const USAGE = `usage:
  release check --tag <vX.Y.Z> [--notes <file>]   the tag matches package.json and CHANGELOG.md
  release plan --ref <git ref>                    whether a push releases, and with which tag
  release tag --tag <vX.Y.Z> --commit <sha>       tag that commit on origin, once`

export interface ReleaseContext {
  readonly root: string
  readonly environment: NodeJS.ProcessEnv
  readonly tags: TagRepository
}

// The steps of .github/workflows/release.yml. Each one prints what it decided and gives its results
// to the next steps of GitHub Actions (GITHUB_OUTPUT).
export async function main(argv: readonly string[], context: ReleaseContext): Promise<number> {
  const [command, ...args] = argv
  switch (command) {
    case 'check':
      return check(args, context)
    case 'plan':
      return plan(args, context)
    case 'tag':
      return tag(args, context)
    default:
      return usageError(`unknown command "${String(command)}"`)
  }
}

// Whether a tag can be released: prints the version and writes the release notes taken from
// CHANGELOG.md.
async function check(
  args: readonly string[],
  { root, environment }: ReleaseContext,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { tag: { type: 'string', default: '' }, notes: { type: 'string' } },
  })
  const release = checkRelease({
    tag: values.tag,
    packageVersion: await packageVersion(root),
    changelog: await readText(join(root, 'CHANGELOG.md')),
  })
  if (!release.isReady) {
    console.error(release.problems.map((problem) => `✘ ${problem}`).join('\n'))
    return 1
  }
  console.log(`Releasing sqldoro ${release.version}`)
  if (values.notes !== undefined) {
    await writeText(values.notes, `${release.notes}\n`)
  }
  await writeOutputs(environment, new Map([['version', release.version]]))
  return 0
}

// Whether the push of a ref releases, and the tag of that release.
async function plan(args: readonly string[], context: ReleaseContext): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { ref: { type: 'string', default: '' } },
  })
  if (values.ref === '') {
    return usageError('plan needs the --ref that was pushed')
  }
  const release = planRelease({
    ref: values.ref,
    packageVersion: await packageVersion(context.root),
    tagCommits: await context.tags.tagCommits(),
  })
  console.log(describePlan(release))
  await writeOutputs(
    context.environment,
    new Map([
      ['tag', release.tag],
      ['should-release', String(release.shouldRelease)],
      ['should-create-tag', String(release.shouldCreateTag)],
    ]),
  )
  return 0
}

// Tags the commit the gates checked, on origin, unless a rerun finds it tagged already.
async function tag(args: readonly string[], { tags }: ReleaseContext): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { tag: { type: 'string', default: '' }, commit: { type: 'string', default: '' } },
  })
  const version = versionOf(values.tag)
  if (version === undefined || !FULL_COMMIT.test(values.commit)) {
    return usageError('tag needs a version --tag and the full hash of the --commit')
  }
  const annotated = { name: values.tag, message: `sqldoro ${version}`, commit: values.commit }
  return applyTag(annotated, (await tags.tagCommits()).get(values.tag), tags)
}

async function applyTag(
  annotated: AnnotatedTag,
  taggedCommit: string | undefined,
  tags: TagRepository,
): Promise<number> {
  const { name, commit } = annotated
  switch (tagAction(taggedCommit, commit)) {
    case TagAction.Create:
      await tags.pushTag(annotated)
      console.log(`Tagged ${commit} as ${name}`)
      return 0
    case TagAction.Keep:
      console.log(`${name} already tags ${commit}: kept as it is`)
      return 0
    case TagAction.Conflict:
      console.error(
        `✘ ${name} already tags ${String(taggedCommit)}, not ${commit}: it is not moved`,
      )
      return 1
  }
}

function describePlan({ tag: name, shouldRelease, shouldCreateTag }: ReleasePlan): string {
  if (!shouldRelease) {
    return `${name} already exists: nothing to release`
  }
  return shouldCreateTag
    ? `${name} does not exist yet: releasing it, then tagging it`
    : `Releasing the pushed tag ${name}`
}

async function packageVersion(root: string): Promise<string> {
  const manifest = parseObject(JSON.parse(await readText(join(root, 'package.json'))))
  return field(manifest, 'version', STRING)
}

async function writeOutputs(
  environment: NodeJS.ProcessEnv,
  outputs: ReadonlyMap<string, string>,
): Promise<void> {
  const outputFile = environment['GITHUB_OUTPUT'] ?? ''
  if (outputFile === '') {
    return
  }
  const lines = [...outputs].map(([name, value]) => {
    if (LINE_BREAK.test(value)) {
      throw new TypeError(`the output "${name}" would span several lines`)
    }
    return `${name}=${value}\n`
  })
  await appendText(outputFile, lines.join(''))
}

function usageError(problem: string): number {
  console.error(`${problem}\n${USAGE}`)
  return USAGE_ERROR
}
