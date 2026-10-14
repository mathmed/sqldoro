import { appendText } from '../shared/files.ts'

const LINE_BREAK = /[\r\n]/u

// Gives values to the next steps (GITHUB_OUTPUT); a value never spans lines, so it cannot set
// another output.
export async function writeOutputs(
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

// Adds Markdown to the summary of the job (GITHUB_STEP_SUMMARY).
export async function writeSummary(
  environment: NodeJS.ProcessEnv,
  markdown: string,
): Promise<void> {
  const summaryFile = environment['GITHUB_STEP_SUMMARY'] ?? ''
  if (summaryFile !== '') {
    await appendText(summaryFile, `${markdown}\n`)
  }
}
