const SHORT_SHA_LENGTH = 7
const DEFAULT_SERVER_URL = 'https://github.com'
// "2026-11-17T18:02:41.000Z" → "2026-11-17 18:02 UTC": the time of the report, in UTC whatever the
// machine's time zone.
const MINUTES_END = 16
const SEPARATOR = ' · '

export function footerFromEnvironment(environment: NodeJS.ProcessEnv, now: Date): string {
  const sha = nonEmpty(environment['QUALITY_REPORT_SHA']) ?? nonEmpty(environment['GITHUB_SHA'])
  const url = runUrl(environment, environment['GITHUB_RUN_ID'])
  return [
    sha === undefined ? '' : `commit \`${sha.slice(0, SHORT_SHA_LENGTH)}\``,
    `${now.toISOString().slice(0, MINUTES_END).replace('T', ' ')} UTC`,
    url === '' ? '' : `[CI run](${url})`,
  ]
    .filter((part) => part !== '')
    .join(SEPARATOR)
}

// The link to a run of this repository's workflows, or empty outside GitHub Actions.
export function runUrl(environment: NodeJS.ProcessEnv, runId: string | undefined): string {
  const repository = nonEmpty(environment['GITHUB_REPOSITORY'])
  const id = nonEmpty(runId)
  if (repository === undefined || id === undefined) {
    return ''
  }
  const server = nonEmpty(environment['GITHUB_SERVER_URL']) ?? DEFAULT_SERVER_URL
  return `${server}/${repository}/actions/runs/${id}`
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === '' ? undefined : value
}
