import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { appendText, readText, writeText } from '../shared/files.ts'
import { field, parseObject, STRING } from '../shared/json.ts'
import { checkRelease } from './release-check.ts'

const USAGE_ERROR = 2
const USAGE = 'usage: release check --tag <vX.Y.Z> [--notes <file>]'

// `check` makes sure a tag can be released: it prints the version, writes the release notes taken
// from CHANGELOG.md, and gives the version to the next steps of GitHub Actions (GITHUB_OUTPUT).
export async function main(
  argv: readonly string[],
  context: { readonly root: string; readonly environment: NodeJS.ProcessEnv },
): Promise<number> {
  const [command, ...args] = argv
  if (command !== 'check') {
    console.error(`unknown command "${String(command)}"\n${USAGE}`)
    return USAGE_ERROR
  }
  const { values } = parseArgs({
    args: [...args],
    options: { tag: { type: 'string', default: '' }, notes: { type: 'string' } },
  })
  const manifest = parseObject(JSON.parse(await readText(join(context.root, 'package.json'))))
  const check = checkRelease({
    tag: values.tag,
    packageVersion: field(manifest, 'version', STRING),
    changelog: await readText(join(context.root, 'CHANGELOG.md')),
  })
  if (!check.isReady) {
    console.error(check.problems.map((problem) => `✘ ${problem}`).join('\n'))
    return 1
  }
  await publish(check, {
    notesFile: values.notes,
    outputFile: context.environment['GITHUB_OUTPUT'],
  })
  return 0
}

async function publish(
  { version, notes }: { readonly version: string; readonly notes: string },
  {
    notesFile,
    outputFile,
  }: { readonly notesFile: string | undefined; readonly outputFile: string | undefined },
): Promise<void> {
  console.log(`Releasing sqldoro ${version}`)
  if (notesFile !== undefined) {
    await writeText(notesFile, `${notes}\n`)
  }
  if (outputFile !== undefined && outputFile !== '') {
    await appendText(outputFile, `version=${version}\n`)
  }
}
