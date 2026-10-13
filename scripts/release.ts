// The steps of .github/workflows/release.yml (see docs/RELEASING.md).
//   check --tag <vX.Y.Z> [--notes <file>]   the tag matches package.json and CHANGELOG.md dates its
//                                           section; writes that section as the release notes
//   plan --ref <git ref>                    whether a push releases: a pushed version tag does, a
//                                           push to main does while package.json's version has no tag
//   tag --tag <vX.Y.Z> --commit <sha>       creates and pushes the annotated tag on that commit, once
import { main } from './release/cli.ts'
import { gitTags } from './release/git-tags.ts'

// process.argv starts with the node binary and this script.
const ARGUMENTS_START = 2

process.exitCode = await main(process.argv.slice(ARGUMENTS_START), {
  root: process.cwd(),
  environment: process.env,
  tags: gitTags(process.cwd()),
})
