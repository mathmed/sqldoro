// The steps of .github/workflows/release.yml (see docs/RELEASING.md).
//   prepare --ref <ref> --bump <patch|minor|major> [--version <X.Y.Z>]
//                                 from main only: chooses the version (never a tagged one) and moves
//                                 what [Unreleased] lists into its dated section of CHANGELOG.md
//   check --tag <vX.Y.Z> [--notes <file>]
//                                 the tag matches package.json and CHANGELOG.md dates its section;
//                                 writes that section as the release notes
//   commit --tag <vX.Y.Z>         commits the release and pushes it to the branch release/vX.Y.Z
//   land --tag <vX.Y.Z> --commit <sha> --base <sha>
//                                 fast-forwards main from <base> to the release commit, then tags it
//   cleanup --branch <release/vX.Y.Z>
//                                 deletes the release branch
import { main } from './release/cli.ts'
import { gitRemote } from './release/git-remote.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), {
  root: process.cwd(),
  environment: process.env,
  remote: gitRemote(process.cwd()),
  now: () => new Date(),
})
