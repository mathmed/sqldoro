import type { ReleaseRemote } from './git-remote.ts'
import { writeSummary } from './github-actions.ts'
import { MAIN_BRANCH, MainAction, mainAction, TagAction, tagAction } from './landing.ts'

export interface LandingRequest {
  readonly tag: string
  readonly version: string
  readonly base: string
  readonly commit: string
}

interface LandingContext {
  readonly remote: ReleaseRemote
  readonly environment: NodeJS.ProcessEnv
}

// Lands the release commit once every gate has passed: main fast-forwards to it, then it gets its
// tag. Nothing is pushed unless both can happen, and a rerun skips what is done already.
export async function land(request: LandingRequest, context: LandingContext): Promise<number> {
  const { remote } = context
  const [branchCommits, tagCommits] = await Promise.all([
    remote.branchCommits(),
    remote.tagCommits(),
  ])
  const taggedCommit = tagCommits.get(request.tag)
  const tagStep = tagAction(taggedCommit, request.commit)
  if (tagStep === TagAction.Conflict) {
    return refuse(
      `${request.tag} already tags ${String(taggedCommit)}, not ${request.commit}`,
      context,
    )
  }
  const mainCommit = branchCommits.get(MAIN_BRANCH)
  if (mainAction(mainCommit, request) === MainAction.Moved) {
    return refuse(movedMain(request, mainCommit), context)
  }
  await advanceMain(request, mainCommit, remote)
  await createTag(request, tagStep, remote)
  return 0
}

async function advanceMain(
  { commit }: LandingRequest,
  mainCommit: string | undefined,
  remote: ReleaseRemote,
): Promise<void> {
  if (mainCommit === commit) {
    console.log(`main is already at ${commit}`)
    return
  }
  await remote.pushCommit(commit, MAIN_BRANCH)
  console.log(`main fast-forwarded to ${commit}`)
}

async function createTag(
  { tag, version, commit }: LandingRequest,
  tagStep: TagAction,
  remote: ReleaseRemote,
): Promise<void> {
  if (tagStep === TagAction.Keep) {
    console.log(`${tag} already tags ${commit}`)
    return
  }
  await remote.pushTag({ name: tag, message: `sqldoro ${version}`, commit })
  console.log(`Tagged ${commit} as ${tag}`)
}

function movedMain({ base }: LandingRequest, mainCommit: string | undefined): string {
  return (
    `main moved while the release ran: it was prepared on ${base}, and main is now at ` +
    `${String(mainCommit)}. main, the tags and the releases are untouched: run the Release ` +
    'workflow again to release from the new main.'
  )
}

async function refuse(problem: string, { environment }: LandingContext): Promise<number> {
  console.error(`✘ ${problem}`)
  await writeSummary(environment, `**Not released.** ${problem}`)
  return 1
}
