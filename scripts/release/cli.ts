import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { readText, writeText } from '../shared/files.ts'
import { field, parseObject, STRING } from '../shared/json.ts'
import type { ReleaseRemote } from './git-remote.ts'
import { writeOutputs } from './github-actions.ts'
import { land, type LandingRequest } from './land.ts'
import { isReleaseBranch, releaseBranchOf } from './landing.ts'
import { isBump } from './next-version.ts'
import { type Preparation, prepareRelease } from './preparation.ts'
import { checkRelease } from './release-check.ts'
import { versionOf } from './version-tag.ts'

const USAGE_ERROR = 2
const ISO_DATE_LENGTH = 10
const FULL_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u
const CHANGELOG = 'CHANGELOG.md'
const USAGE = `usage:
  release prepare --ref <git ref> --bump <patch|minor|major> [--version <X.Y.Z>]
      choose the version and date its section of CHANGELOG.md
  release check --tag <vX.Y.Z> [--notes <file>]
      the tag matches package.json and CHANGELOG.md; write the release notes
  release commit --tag <vX.Y.Z>
      commit the release and push it to its branch release/vX.Y.Z
  release land --tag <vX.Y.Z> --commit <sha> --base <sha>
      fast-forward main from <base> to the release commit, then tag it
  release cleanup --branch <release/vX.Y.Z>
      delete the release branch from origin`

type ReadyPreparation = Extract<Preparation, { readonly isReady: true }>

export interface ReleaseContext {
  readonly root: string
  readonly environment: NodeJS.ProcessEnv
  readonly remote: ReleaseRemote
  readonly now: () => Date
}

type Command = (args: readonly string[], context: ReleaseContext) => Promise<number>

// The steps of .github/workflows/release.yml. Each one prints what it did and gives its results to
// the next steps of GitHub Actions (GITHUB_OUTPUT).
export async function main(argv: readonly string[], context: ReleaseContext): Promise<number> {
  const [command = '', ...args] = argv
  const run = COMMANDS.get(command)
  return run === undefined ? usageError(`unknown command "${command}"`) : run(args, context)
}

// Chooses the version and moves what [Unreleased] lists into its dated section of CHANGELOG.md.
async function prepare(args: readonly string[], context: ReleaseContext): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ref: { type: 'string', default: '' },
      bump: { type: 'string', default: '' },
      version: { type: 'string', default: '' },
    },
  })
  if (!isBump(values.bump)) {
    return usageError(`"${values.bump}" is not a --bump`)
  }
  const preparation = prepareRelease({
    ref: values.ref,
    bump: values.bump,
    requestedVersion: values.version,
    packageVersion: await packageVersion(context.root),
    tagCommits: await context.remote.tagCommits(),
    changelog: await readText(join(context.root, CHANGELOG)),
    date: context.now().toISOString().slice(0, ISO_DATE_LENGTH),
  })
  return preparation.isReady ? writePreparation(preparation, context) : failed(preparation.problems)
}

async function writePreparation(
  { version, tag, branch, changelog }: ReadyPreparation,
  { root, environment }: ReleaseContext,
): Promise<number> {
  await writeText(join(root, CHANGELOG), changelog)
  console.log(`Preparing sqldoro ${version} on ${branch}`)
  const outputs = new Map([
    ['version', version],
    ['tag', tag],
    ['branch', branch],
  ])
  await writeOutputs(environment, outputs)
  return 0
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
    changelog: await readText(join(root, CHANGELOG)),
  })
  if (!release.isReady) {
    return failed(release.problems)
  }
  console.log(`Releasing sqldoro ${release.version}`)
  if (values.notes !== undefined) {
    await writeText(values.notes, `${release.notes}\n`)
  }
  await writeOutputs(environment, new Map([['version', release.version]]))
  return 0
}

// Commits what the release changed and pushes it to the release branch, not to main.
async function commit(
  args: readonly string[],
  { remote, environment }: ReleaseContext,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { tag: { type: 'string', default: '' } },
  })
  const version = versionOf(values.tag)
  if (version === undefined) {
    return usageError('commit needs a version --tag')
  }
  const branch = releaseBranchOf(values.tag)
  const sha = await remote.commitAll(`chore: release ${version}`)
  await remote.pushCommit(sha, branch)
  console.log(`Committed sqldoro ${version} as ${sha} on ${branch}`)
  await writeOutputs(environment, new Map([['commit', sha]]))
  return 0
}

async function landCommand(args: readonly string[], context: ReleaseContext): Promise<number> {
  const request = landingRequest(args)
  return request === undefined
    ? usageError('land needs a version --tag and the full hashes of --commit and --base')
    : await land(request, context)
}

function landingRequest(args: readonly string[]): LandingRequest | undefined {
  const { values } = parseArgs({
    args: [...args],
    options: {
      tag: { type: 'string', default: '' },
      commit: { type: 'string', default: '' },
      base: { type: 'string', default: '' },
    },
  })
  const version = versionOf(values.tag)
  const hasCommits = FULL_COMMIT.test(values.commit) && FULL_COMMIT.test(values.base)
  return version === undefined || !hasCommits
    ? undefined
    : { tag: values.tag, version, base: values.base, commit: values.commit }
}

// Deletes the release branch, whatever happened to the release; a rerun finds it gone.
async function cleanup(args: readonly string[], { remote }: ReleaseContext): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { branch: { type: 'string', default: '' } },
  })
  if (!isReleaseBranch(values.branch)) {
    return usageError(`"${values.branch}" is not a release branch`)
  }
  if (!(await remote.branchCommits()).has(values.branch)) {
    console.log(`${values.branch} is already gone`)
    return 0
  }
  await remote.deleteBranch(values.branch)
  console.log(`Deleted ${values.branch}`)
  return 0
}

const COMMANDS: ReadonlyMap<string, Command> = new Map([
  ['prepare', prepare],
  ['check', check],
  ['commit', commit],
  ['land', landCommand],
  ['cleanup', cleanup],
])

async function packageVersion(root: string): Promise<string> {
  const manifest = parseObject(JSON.parse(await readText(join(root, 'package.json'))))
  return field(manifest, 'version', STRING)
}

function failed(problems: readonly string[]): number {
  console.error(problems.map((problem) => `✘ ${problem}`).join('\n'))
  return 1
}

function usageError(problem: string): number {
  console.error(`${problem}\n${USAGE}`)
  return USAGE_ERROR
}
