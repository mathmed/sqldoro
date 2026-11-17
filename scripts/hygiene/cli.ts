import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { fileSize, isSymbolicLink, readBytes, writeText } from '../shared/files.ts'
import { addedFiles, stagedAddedFiles, workingTreeFiles } from '../shared/git-files.ts'
import { compareText, plural } from '../shared/text.ts'
import {
  fixText,
  formatProblem,
  isBinary,
  largeFileProblem,
  type Problem,
  textProblems,
} from './rules.ts'

const USAGE_ERROR = 2
const USAGE = `usage:
  hygiene check [--base <ref>]
      fail on trailing whitespace or a missing or extra final newline in any text file git knows or
      would add, and on a file above 500kb added since <ref> (without --base: added in the index)
  hygiene fix [<file>...]
      strip the trailing whitespace and fix the final newline of the files (default: every file)`

// The repository whose files are checked: every file git knows or would add.
export interface HygieneContext {
  readonly root: string
}

export async function main(argv: readonly string[], context: HygieneContext): Promise<number> {
  const [command, ...args] = argv
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { base: { type: 'string' } },
    allowPositionals: true,
  })
  if (command === 'check' && positionals.length === 0) {
    return check(context.root, values.base)
  }
  if (command === 'fix' && values.base === undefined) {
    return fix(context.root, positionals)
  }
  return usageError(String(command))
}

function usageError(command: string): number {
  console.error(`unknown command "${command}", or arguments it does not take\n${USAGE}`)
  return USAGE_ERROR
}

async function check(root: string, base: string | undefined): Promise<number> {
  const files = (await workingTreeFiles(root)).toSorted(compareText)
  const added = base === undefined ? await stagedAddedFiles(root) : await addedFiles(root, base)
  const problems = [
    ...(await Promise.all(files.map(async (file) => problemsOf(root, file)))).flat(),
    ...(await Promise.all(added.map(async (file) => sizeProblem(root, file)))).flat(),
  ]
  for (const problem of problems) {
    console.log(formatProblem(problem))
  }
  const checked = plural(files.length, 'file', 'files')
  if (problems.length === 0) {
    console.log(`File hygiene: ${checked} checked, no problem.`)
    return 0
  }
  const found = plural(problems.length, 'problem', 'problems')
  console.log(`File hygiene: ${checked} checked, ${found} (\`make format\` fixes the whitespace).`)
  return 1
}

async function problemsOf(root: string, file: string): Promise<Problem[]> {
  const text = await readTextFile(join(root, file))
  return text === undefined ? [] : textProblems(file, text)
}

async function sizeProblem(root: string, file: string): Promise<Problem[]> {
  const problem = largeFileProblem(file, await fileSize(join(root, file)))
  return problem === undefined ? [] : [problem]
}

async function fix(root: string, files: readonly string[]): Promise<number> {
  const targets = files.length === 0 ? await workingTreeFiles(root) : files
  for (const file of targets.toSorted(compareText)) {
    await fixFile(join(root, file), file)
  }
  return 0
}

async function fixFile(path: string, file: string): Promise<void> {
  const text = await readTextFile(path)
  if (text === undefined || fixText(text) === text) {
    return
  }
  await writeText(path, fixText(text))
  console.log(`fixed ${file}`)
}

// The text of a file, or undefined for a binary file or a symbolic link (its target is checked).
async function readTextFile(path: string): Promise<string | undefined> {
  if (await isSymbolicLink(path)) {
    return undefined
  }
  const bytes = await readBytes(path)
  return isBinary(bytes) ? undefined : bytes.toString('utf8')
}
